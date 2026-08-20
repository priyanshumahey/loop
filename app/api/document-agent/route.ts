import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai"

import { calModel } from "@/lib/cal-agent/model"
import {
  APPROVAL_TOOLS,
  buildCalendarTools,
} from "@/lib/cal-agent/tools"
import { persistConversationServer } from "@/lib/db/agent-conversations-server"
import { getDocument } from "@/lib/db/documents"
import {
  buildDocumentTools,
  buildLiveEditorTools,
  DOCUMENT_APPROVAL_TOOLS,
} from "@/lib/document-agent/tools"
import { selectedTextContextSchema } from "@/lib/document-agent/editor-tools"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 30

const toolApproval = Object.fromEntries(
  [...DOCUMENT_APPROVAL_TOOLS, ...APPROVAL_TOOLS].map((name) => [
    name,
    "user-approval" as const,
  ])
)

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
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? ""
    const gmt = get("timeZoneName")
    const offset = gmt === "GMT" ? "+00:00" : gmt.replace("GMT", "")
    const hour = get("hour") === "24" ? "00" : get("hour")
    return [
      `The user's timezone is ${timeZone} (current UTC offset ${offset}).`,
      `The current local date and time is ${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}${offset}.`,
      `Interpret relative dates and times in ${timeZone}, and pass ISO 8601 datetimes with offset ${offset} to calendar tools.`,
    ].join(" ")
  } catch {
    return `The current UTC date and time is ${now.toISOString()}.`
  }
}

function withSelectedTextContext(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "user") return message
    const parsed = selectedTextContextSchema.safeParse(
      (message.metadata as { selectedTextContext?: unknown } | undefined)
        ?.selectedTextContext
    )
    if (!parsed.success) return message

    const context = parsed.data
    const actionInstruction = context.intent
      ? `The user invoked the ${context.intent} selection action. Inspect the live editor, then call replaceSelection with this exact selected text as expectedText and a complete replacement. Stop for approval through the edit tool; do not only suggest prose in chat.`
      : "Treat this as the user's active editor selection. Do not quote it back unless needed."
    return {
      ...message,
      parts: [
        ...message.parts,
        {
          type: "text" as const,
          text: [
            "\n\n<selected_text_context>",
            `Top-level blocks: ${context.startBlock} through ${context.endBlock}`,
            ...(context.intent ? [`Requested action: ${context.intent}`] : []),
            context.text,
            "</selected_text_context>",
            actionInstruction,
          ].join("\n"),
        },
      ],
    }
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  let messages: UIMessage[]
  let documentId: string | undefined
  let chatId: string | undefined
  let scope: "calendar" | "documents" | "document"
  let timezone: string | undefined
  let autoApprove = false
  try {
    ;({
      messages,
      documentId,
      id: chatId,
      scope = documentId ? "document" : "documents",
      timezone,
      autoApprove = false,
    } = (await request.json()) as {
      messages: UIMessage[]
      documentId?: string
      id?: string
      scope?: "calendar" | "documents" | "document"
      timezone?: string
      autoApprove?: boolean
    })
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }

  if (!Array.isArray(messages)) {
    return new Response("Invalid messages", { status: 400 })
  }

  let currentTitle: string | null = null
  if (documentId) {
    const document = await getDocument(documentId)
    if (!document.success) {
      return new Response(document.error, {
        status: document.error === "Unauthorized" ? 401 : 400,
      })
    }
    if (!document.data) return new Response("Document not found", { status: 404 })
    currentTitle = document.data.title
  }

  const result = streamText({
    model: calModel,
    system: [
      "You are Loop Writer, an expert document partner embedded beside a rich-text editor.",
      timeContext(timezone),
      documentId
        ? `The currently open document is \"${currentTitle}\" (id: ${documentId}).`
        : "You are in the document library. Help the user find, create, and organize documents.",
      "Help the user move from rough thinking to clear, useful writing. You can brainstorm, outline, draft, critique, summarize, and revise.",
      "You can also search and read the user's Gmail, inspect their calendar, check availability, and manage calendar events. Treat email, calendar, and documents as one connected workspace.",
      documentId
        ? "When a request depends on the current document or asks you to edit it, always call inspectEditor first. It reads the mounted editor, including unsaved content and the current selection. Do not inspect the editor for unrelated email or calendar questions, and never use stale database content when inspectEditor is available."
        : "Use the document and folder list tools before acting on an existing library item.",
      "For open-document edits, prefer replaceSelection, insertBlocks, replaceBlocks, or deleteBlocks so the change applies directly to the mounted editor with native undo. Use replaceEditorDocument only for a genuinely broad rewrite.",
      "When the user asks to add, attach, or embed a calendar event or email in the open document, use the native embedCalendarEvent or embedEmail tool instead of pasting its details as Markdown. Resolve the exact source with calendar/email tools first, inspectEditor for placement, and copy the returned stable ids and current fields exactly into the embed tool. Include optional rich fields when returned: event description/timezone/recurrence; email recipients/body preview/labels/thread count/attachments.",
      "For every targeted edit, copy the exact current text from inspectEditor into expectedText (or expectedAnchorText for insertion). Never omit that guard when an inspected target exists. Make changeSummary concrete and user-facing, naming what will change rather than saying only 'update document'.",
      "All mutations require explicit user approval in the UI. Describe the intended change briefly, call the right tool, and do not claim it happened until the tool output confirms success.",
      "Use createNewDocument when the user asks for a separate artifact. Use listUserDocuments before acting on a document that is not currently open.",
      "When the user asks for email or calendar information, use the relevant tools directly instead of asking them to leave the document or paste content.",
      "For research-driven writing, read full relevant emails or threads rather than relying on snippets, inspect relevant events and documents, then ground the draft only in facts returned by tools or supplied by the user.",
      "When an email proposes a time, use checkAvailability before claiming it is free; offer to create the event or incorporate the confirmed plan into the document when useful.",
      "Use listEmails to search or triage mail, readEmail for a full message, readThread for a whole exchange, and draftReply for a copy-ready response. The UI renders these results, so summarize instead of repeating them verbatim.",
      "Use listEvents or searchEvents for schedules and event research, showCalendar for a visual day/week/month view, findFreeSlots when the time is unknown, and checkAvailability for an exact proposed window.",
      "Calendar create, update, and delete actions require approval. Resolve existing events to stable ids first and do not claim a mutation succeeded until its tool output confirms it.",
      "In the library, use listUserFolders, createNewFolder, moveDocumentToFolder, and deleteUserFolder to organize documents. Resolve stable ids with the list tools before moving or deleting anything.",
      "Do not delete anything unless the user clearly asks. The delete tool is permanent.",
      "Write document content in clean Markdown. Use headings and short sections when they improve scanability; do not over-format ordinary prose.",
      "Keep chat replies concise because the editor and tool cards show the actual work. After completing a task, offer at most one relevant next step.",
    ].join(" "),
    messages: await convertToModelMessages(withSelectedTextContext(messages), {
      ignoreIncompleteToolCalls: true,
    }),
    tools: {
      ...buildCalendarTools(timezone),
      ...buildDocumentTools(documentId, { useLiveEditor: Boolean(documentId) }),
      ...(documentId ? buildLiveEditorTools() : {}),
    },
    toolApproval: autoApprove ? undefined : toolApproval,
    experimental_toolApprovalSecret: process.env.TOOL_APPROVAL_SECRET,
    stopWhen: stepCountIs(12),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: ({ messages: updated }) => {
      if (!chatId) return
      void persistConversationServer(supabase, {
        id: chatId,
        messages: updated,
        scope,
        documentId: documentId ?? null,
      })
    },
  })
}