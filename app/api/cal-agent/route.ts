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
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 30

/** Per-tool approval config: every mutating tool requires user confirmation. */
const toolApproval = Object.fromEntries(
  APPROVAL_TOOLS.map((name) => [name, "user-approval" as const])
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

/**
 * POST /api/cal-agent
 * The calendar assistant. Streams an answer that may call calendar tools; tool
 * results are streamed back as typed message parts the client renders as custom
 * UI. Multi-step so the model can search, read results, then respond.
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
  let autoApprove = false
  try {
    ;({
      messages,
      timezone,
      id: chatId,
      autoApprove = false,
    } = (await req.json()) as {
      messages: UIMessage[]
      timezone?: string
      id?: string
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
      "You are Loop's calendar assistant.",
      timeContext(timezone),
      "Help the user find, understand, and plan around events on their calendar.",
      "Each event may include a description (notes/agenda) and location; use them to answer questions about what a meeting is about.",
      "Tool use:",
      "- searchEvents: when the user searches for specific events by keyword.",
      "- listEvents: when the user wants everything in a range ('what's on Friday').",
      "- showCalendar: when the user wants to SEE or get a visual overview of their schedule ('what does my day/week/month look like', 'show me next week'). Pick view day/week/month and pass an anchor date inside the period. Prefer this over listEvents when a visual layout helps.",
      "- calendarStats: for meeting-load questions ('how much time in meetings'), then give practical tips.",
      "- findFreeSlots: for scheduling ('when am I free for a 30-min call'). It searches the whole day by default and the UI flags early-morning/late-night options; only pass earliestHour/latestHour when the user asks to limit hours (e.g. earliestHour 9 + latestHour 17 for working hours). If some suggestions are early or late, briefly say so.",
      "- createEvent / updateEvent / deleteEvent: to add, reschedule, or remove events. These require the user to approve in the UI; to update or delete, first find the event id via searchEvents or listEvents.",
      "Reply style: the UI renders formatted, clickable event cards below your message, so DO NOT",
      "list events or their times in your text. Never write raw ISO timestamps or machine dates.",
      "Keep replies to one or two short sentences (e.g. \"You have 4 events tomorrow, including 1 interview.\"),",
      "and use natural language for any time you must mention (like \"tomorrow at 2 pm\"). Offer a helpful next step if relevant.",
    ].join(" "),
    messages: await convertToModelMessages(messages),
    tools: buildCalendarTools(timezone),
    // When the user has enabled auto-approve, skip the confirmation gate so
    // mutating tools execute directly within the same turn.
    toolApproval: autoApprove ? undefined : toolApproval,
    experimental_toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET,
    stopWhen: stepCountIs(6),
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
