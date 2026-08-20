import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai"
import { after } from "next/server"

import { calModel } from "@/lib/cal-agent/model"
import {
  clearActiveStream,
  persistStream,
  setActiveStream,
} from "@/lib/cal-agent/resumable"
import { APPROVAL_TOOLS, buildCalendarTools } from "@/lib/cal-agent/tools"
import { persistConversationServer } from "@/lib/db/agent-conversations-server"
import {
  buildDocumentTools,
  DOCUMENT_LIBRARY_APPROVAL_TOOLS,
} from "@/lib/document-agent/tools"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 30

/** Per-tool approval config: every mutating tool requires user confirmation. */
const toolApproval = Object.fromEntries(
  [...APPROVAL_TOOLS, ...DOCUMENT_LIBRARY_APPROVAL_TOOLS].map((name) => [
    name,
    "user-approval" as const,
  ])
)

/**
 * Build a timezone-aware description of "now" for the system prompt, so the
 * model interprets times like "7am" in the user's local timezone and emits ISO
 * datetimes with the correct UTC offset (not naive/UTC times).
 */
function timeContext(timeZone?: string): string {
  const now = new Date()
  if (!timeZone) return `The current UTC date and time is ${now.toISOString()}.`
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "longOffset",
    }).formatToParts(now)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
    const gmt = get("timeZoneName") // e.g. "GMT-07:00" or "GMT"
    const offset = gmt === "GMT" ? "+00:00" : gmt.replace("GMT", "")
    const hour = get("hour") === "24" ? "00" : get("hour")
    const localIso = `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}${offset}`
    return [
      `The user's timezone is ${timeZone} (current UTC offset ${offset}).`,
      `The current local date and time is ${localIso}.`,
      `Interpret any time the user gives (e.g. "7am", "tomorrow afternoon") in ${timeZone}.`,
      `When you pass datetimes to TOOLS, use ISO 8601 with the offset ${offset}`,
      `(e.g. 2026-07-13T07:00:00${offset}). Do NOT put ISO timestamps in your replies to the user.`,
    ].join(" ")
  } catch {
    return `The current UTC date and time is ${now.toISOString()}.`
  }
}

function surfaceContext(surface?: "home" | "calendar" | "mail"): string {
  if (surface === "mail") {
    return "You are currently embedded beside the user's inbox. Prefer email-first framing, but use calendar and document tools whenever they advance the task."
  }
  if (surface === "calendar") {
    return "You are currently embedded beside the user's calendar. Prefer schedule-first framing, but use email and document tools whenever they add needed context or produce a useful artifact."
  }
  return "You are on the user's general workspace home. Choose the most relevant combination of calendar, email, and document tools for the task."
}

/**
 * Inline any context the user attached (calendar events dragged onto the
 * assistant, or an email opened in the reader) as text parts on their message,
 * so the model can see and act on them. The chip UI is driven by message
 * metadata on the client; metadata isn't forwarded to the model, so we surface
 * it as text here (leaving the original messages — and their persisted form —
 * untouched).
 */
function withEventContext(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "user") return message
    const meta = message.metadata as
      | {
          contextEvents?: {
            id: string
            title: string
            start: string
            end: string
            allDay?: boolean
            location?: string
          }[]
          contextEmails?: {
            id: string
            threadId: string
            from: string
            subject: string
            date: string
            snippet: string
          }[]
        }
      | undefined

    const events = meta?.contextEvents
    const emails = meta?.contextEmails
    const extraParts: { type: "text"; text: string }[] = []

    if (events?.length) {
      const lines = events.map((e) => {
        const bits = [`"${e.title}" (id: ${e.id})`]
        bits.push(
          e.allDay ? `all day starting ${e.start}` : `from ${e.start} to ${e.end}`
        )
        if (e.location) bits.push(`at ${e.location}`)
        return `- ${bits.join(", ")}`
      })
      extraParts.push({
        type: "text",
        text:
          `The user attached the following calendar event${events.length > 1 ? "s" : ""} as context for this message:\n` +
          lines.join("\n"),
      })
    }

    if (emails?.length) {
      const lines = emails.map(
        (e) =>
          `- "${e.subject}" from ${e.from} (emailId: ${e.id}, threadId: ${e.threadId}), ${e.date}. Preview: ${e.snippet}`
      )
      extraParts.push({
        type: "text",
        text:
          `The user attached the following email${emails.length > 1 ? "s" : ""} as context for this message. ` +
          `Call readEmail with the emailId (or readThread with the threadId) to get the full contents before answering questions about it. ` +
          `Do NOT ask the user to paste the email — you already have its id:\n` +
          lines.join("\n"),
      })
    }

    if (!extraParts.length) return message
    return { ...message, parts: [...message.parts, ...extraParts] }
  })
}

/**
 * POST /api/cal-agent
 * The shared workspace assistant. Streams an answer that may call calendar,
 * email, and document tools; typed results render as custom UI. Multi-step so
 * the model can search, read results, connect context, then respond.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  let messages: UIMessage[]
  let timezone: string | undefined
  let chatId: string | undefined
  let surface: "home" | "calendar" | "mail" | undefined
  let autoApprove = false
  try {
    ;({
      messages,
      timezone,
      id: chatId,
      surface,
      autoApprove = false,
    } = (await req.json()) as {
      messages: UIMessage[]
      timezone?: string
      id?: string
      surface?: "home" | "calendar" | "mail"
      autoApprove?: boolean
    })
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }

  // Mint the resumable-stream id and publish the pointer BEFORE generation, so a
  // client that reconnects during the model's initial "thinking" phase (before
  // the first token, when the Redis Stream key doesn't exist yet) still finds the
  // stream and waits for it, instead of getting a premature 204.
  const streamId = crypto.randomUUID()
  if (chatId) await setActiveStream(user.id, chatId, streamId)

  const result = streamText({
    model: calModel,
    system: [
      "You are Loop's assistant.",
      timeContext(timezone),
      surfaceContext(surface),
      "Help the user work across their calendar, Gmail, and documents as one connected workspace.",
      "Each event may include a description (notes/agenda) and location; use them to answer questions about what a meeting is about.",
      "Be proactive and think a step ahead. Don't just answer the literal question — anticipate what the user is really trying to accomplish and help them get there.",
      "When it's genuinely useful, surface things they didn't ask about but would want to know: scheduling conflicts or double-bookings, back-to-back meetings with no gap, a meeting missing a location or agenda, an event that likely needs prep, or an email that looks like it needs a reply.",
      "Connect calendar and email: if an email proposes a time, offer to check availability or create the event; if a meeting has attendees, you can look for related email context.",
      "When a request is ambiguous but a sensible default exists, act on that default and briefly say what you assumed, instead of stalling to ask. Only ask a clarifying question when you genuinely cannot proceed safely.",
      "After doing what was asked, offer ONE concrete, relevant next step when there is an obvious one (e.g. 'Want me to move the 3pm to avoid the overlap?'). Keep it to a short offer, not a list.",
      "Tool use:",
      "- searchEvents: when the user searches for specific events by keyword.",
      "- getEventById: retrieve the latest version of an event when a prior tool result already provides its stable id. Prefer this over searching again, because titles can change.",
      "- listEvents: when the user wants everything in a range ('what's on Friday').",
      "- showCalendar: when the user wants to SEE or get a visual overview of their schedule ('what does my day/week/month look like', 'show me next week'). Pick view day/week/month and pass an anchor date inside the period. Prefer this over listEvents when a visual layout helps.",
      "- calendarStats: for meeting-load questions ('how much time in meetings'), then give practical tips.",
      "- checkAvailability: when an exact proposed start and end are already known, including times found in pasted email or message text. Use it instead of searching the whole day for alternatives.",
      "- Never claim a time is free unless checkAvailability reports verified=true. If connected=false, explain that Google Calendar must be connected; if connected=true but verified=false, say the refresh failed and suggest trying again.",
      "- findFreeSlots: when the start time is genuinely unknown ('when am I free for a 30-min call'). It returns exact-duration options and searches the whole day by default. Pass earliestHour/latestHour whenever the user's request or pasted source text gives a time-of-day window. If suggestions are early or late, briefly say so.",
      "- createEvent / updateEvent / deleteEvent: to add, reschedule, or remove events. These require the user to approve in the UI. For update/delete, resolve the event in this order: reuse an id from a prior tool result and refresh it with getEventById; otherwise listEvents in a known date/time window; otherwise searchEvents with broad keywords. Ask the user only when no event or multiple plausible events remain. Never ask for a title, date, or time already present in the conversation.",
      "- For updateEvent, pass eventTitle from the freshly resolved event for display, but pass title only when the user explicitly requests a rename. Never write a stale title during an unrelated update. For a recurring occurrence, set recurrenceScope to single, following, or series based on whether the user means this event, this and following events, or all events; ask when the scope is ambiguous.",
      "- listEmails: when the user wants to see, get, fetch, triage, or summarize their inbox ('my last 100 emails', 'any unread mail', 'emails from Stripe last week', 'what needs a reply'). Prefer the structured filters (from, subject, after, before, hasAttachment, category, unreadOnly) over the raw query field; use maxResults for an explicit count. Each result carries unread/important/starred/category signals — use them to prioritize (important + unread first) when triaging.",
      "- readEmail: to open one specific message in full (body included) after listEmails, e.g. when the user asks what an email says or to summarize it. Reuse the id from the listEmails result.",
      "- readThread: to read an entire conversation (all replies) when the user asks about a thread, reply chain, or the 'whole conversation'. Reuse the threadId from a listEmails or readEmail result.",
      "- draftReply: when the user asks to draft, write, or reply to an email. First read the email/thread for context, then call draftReply with a composed to, subject, and body (in the user's voice). It shows a copy-ready draft card; it does NOT send.",
      "- listUserDocuments: find documents by title or recency before reading, organizing, or deleting one.",
      "- readUserDocument: read a specific document in full after resolving its stable id with listUserDocuments. Use it when the user asks what a document says, wants details from it, or needs it compared with email or calendar context.",
      "- createNewDocument: create a brief, plan, meeting note, draft, or other durable artifact. Ground it in the emails, events, and documents you actually read. This requires approval.",
      "- listUserFolders / createNewFolder / moveDocumentToFolder / deleteUserFolder: inspect and organize the document library. Resolve stable ids before mutations; mutations require approval.",
      "- deleteUserDocument: permanently delete a document only when the user clearly asks. Resolve its id first; this requires approval.",
      "Cross-domain work:",
      "- Treat calendar, email, and documents as connected context. Follow references across them instead of telling the user to switch pages or paste content.",
      "- For meeting preparation, combine the current event, related full email threads, and relevant documents when available, then offer to create or update a useful document.",
      "- When creating a document from email or calendar research, include only facts found in tool results or provided by the user; never invent missing details.",
      "Email research — be thorough, not lazy:",
      "- Snippets are TRUNCATED. They are fine for a quick count or triage, but they routinely omit phone numbers, addresses, agendas, action items, and instructions. Whenever the user wants details, contacts, logistics, action items, or 'everything about X', open the full body with readEmail (or readThread for a chain) for the most relevant messages — do not answer those from snippets alone.",
      "- Before searching for a specific detail (like someone's phone number or email address), first read the full body of messages you already retrieved — the answer is often buried in an email you've already seen but never opened.",
      "- Prioritize by recency: treat SAME-DAY messages as the highest priority, since they carry last-minute links, changes, and instructions. When the user asks about today or to 'fetch everything', specifically look for and open any same-day message on the topic.",
      "- Search persistently and retry with different params instead of giving up or asking the user to paste. If a query misses, broaden it: drop exact-phrase quotes, search the sender's domain (e.g. from:mercor.com), use the key nouns, and widen the date window. It is fine to run several searches and open several emails to get this right — asking the user to paste is a last resort after genuinely broad attempts.",
      "- When the user is preparing for an event, onsite, trip, or meeting, proactively assemble the practical picture from the FULL emails: exact time and location (including floor/room), who to contact with their phone/email, what to bring, and any outstanding to-dos or deadlines.",
      "- When drafting, ground every statement in the actual email and what the user told you. Never invent roles, names, dates, commitments, or details that weren't in the email or the conversation. If a detail is uncertain, leave it out or keep it general rather than fabricating specifics.",
      "The UI renders email results, opened messages, and threads as cards below your message, so DO NOT restate each email's sender, subject, body, or time verbatim in your text; give a brief summary, count, or triage (e.g. \"3 unread, 1 important from Stripe.\"). If Google isn't connected, tell the user to connect it.",
      "Reply style: the UI renders formatted, clickable event cards below your message, so DO NOT",
      "list events or their times in your text. Never write raw ISO timestamps or machine dates.",
      'Use natural language for any time you must mention (like "tomorrow at 2 pm").',
      'By default keep replies to one or two short sentences (e.g. "You have 4 events tomorrow, including 1 interview.").',
      "But when the user explicitly asks for a breakdown, details, or an in-depth answer, give a complete, well-organized response — use short paragraphs or tight bullet points, not long run-on sentences. Match the depth to what they asked for.",
      "Offer a helpful next step if relevant.",
    ].join(" "),
    messages: await convertToModelMessages(withEventContext(messages), {
      // A stopped or interrupted stream can leave a persisted tool call without
      // a result. Keep the usable history instead of rejecting the next turn.
      ignoreIncompleteToolCalls: true,
    }),
    tools: {
      ...buildCalendarTools(timezone),
      ...buildDocumentTools(undefined, { useLiveEditor: true }),
    },
    // When the user has enabled auto-approve, skip the confirmation gate so
    // mutating tools execute directly within the same turn.
    toolApproval: autoApprove ? undefined : toolApproval,
    experimental_toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET,
    // Room to search, retry with different params, and read several full email
    // bodies in one turn (e.g. "fetch everything about my onsite today").
    stopWhen: stepCountIs(12),
  })

  // Mirror the response into a durable Redis Stream so a reconnecting client (a
  // refresh mid-answer, or a second tab) can replay what it missed and follow
  // the rest live. `consumeSseStream` gets a tee'd copy that doesn't block the
  // original client; draining starts now (so Redis fills during generation) and
  // `after` keeps the function alive until it finishes, even if the original
  // client disconnects.
  let finalMessages: UIMessage[] | null = null
  return result.toUIMessageStreamResponse({
    // Enables persistence mode: `onFinish` receives the full message list
    // (input + assistant reply) so we can save it server-side.
    originalMessages: messages,
    onFinish: ({ messages: updated }) => {
      finalMessages = updated
    },
    consumeSseStream: chatId
      ? async ({ stream }) => {
          after(
            persistStream(streamId, stream)
              .then(async () => {
                // Save the reply server-side so it survives even if the client
                // disconnected before it could persist. The client remains the
                // primary writer; this is a safety net (last-write-wins).
                if (finalMessages) {
                  await persistConversationServer(supabase, {
                    id: chatId,
                    messages: finalMessages,
                  })
                }
              })
              // Drop the pointer once generation ends so a later mount gets a
              // fast 204 instead of resuming a stream that's already done.
              .finally(() => clearActiveStream(user.id, chatId))
          )
        }
      : undefined,
  })
}
