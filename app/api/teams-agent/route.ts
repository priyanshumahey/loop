import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai"
import { z } from "zod"

import { calModel } from "@/lib/cal-agent/model"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Assistant for the /teams prototype. Deliberately unauthenticated and
 * stateless: the client sends the mock thread it is looking at, so there is no
 * user data involved and nothing to persist.
 */
const threadContextSchema = z.object({
  subject: z.string(),
  counterparty: z.string(),
  status: z.string(),
  assignee: z.string().nullable(),
  messages: z.array(
    z.object({ from: z.string(), sentAt: z.string(), body: z.string() })
  ),
  comments: z.array(z.object({ author: z.string(), body: z.string() })),
  draft: z.string(),
  me: z.string(),
  team: z.array(
    z.object({ name: z.string(), role: z.string(), online: z.boolean() })
  ),
  otherThreads: z.array(
    z.object({
      subject: z.string(),
      counterparty: z.string(),
      status: z.string(),
      assignee: z.string().nullable(),
      waitingOn: z.string(),
    })
  ),
})

/**
 * Composes a reply into the thread's shared draft. The tool only returns the
 * paragraphs — the client writes them into the Yjs document, so every
 * collaborator watching the thread sees the text appear at the same time.
 */
const composeDraft = tool({
  description:
    "Write or extend the shared reply draft for this thread. Use when the user " +
    "asks you to draft, write, reply, or continue the email. The text is " +
    "inserted into the draft everyone on the thread is editing together.",
  inputSchema: z.object({
    paragraphs: z
      .array(z.string())
      .min(1)
      .max(12)
      .describe(
        "The reply, one entry per paragraph, in plain prose with no markdown " +
          "and no subject line. Write in the voice of the team member replying."
      ),
  }),
  execute: async ({ paragraphs }) => ({ paragraphs }),
})

/**
 * The action tools return their intent rather than applying it. The client
 * writes the change into the thread's Yjs document, so a teammate accepting a
 * suggestion moves the thread for everyone watching it.
 */
const assignThread = tool({
  description:
    "Propose handing this thread to a specific teammate. Use when the user asks " +
    "who should own, take, or handle it, or when the thread clearly needs " +
    "someone else's expertise.",
  inputSchema: z.object({
    member: z.string().describe("The teammate's first name, exactly as listed in TEAM."),
    reason: z.string().describe("One short sentence on why they're the right owner."),
  }),
  execute: async ({ member, reason }) => ({ kind: "assign", member, reason }),
})

const setStatus = tool({
  description:
    "Propose moving this thread's status. Use when the conversation has clearly " +
    "moved on — waiting once a reply has been sent, closed once it is resolved.",
  inputSchema: z.object({
    status: z.enum(["open", "waiting", "closed"]),
    reason: z.string().describe("One short sentence on why."),
  }),
  execute: async ({ status, reason }) => ({ kind: "status", status, reason }),
})

function buildSystemPrompt(thread: z.infer<typeof threadContextSchema>): string {
  const transcript = thread.messages
    .map((m) => `${m.from} (${m.sentAt}):\n${m.body}`)
    .join("\n\n")

  const notes = thread.comments.length
    ? thread.comments.map((c) => `${c.author}: ${c.body}`).join("\n")
    : "(none yet)"

  const roster = thread.team
    .map((m) => `${m.name} — ${m.role}${m.online ? " (online now)" : ""}`)
    .join("\n")

  const inbox = thread.otherThreads.length
    ? thread.otherThreads
        .map(
          (t) =>
            `"${t.subject}" with ${t.counterparty} — ${t.status}, ` +
            `${t.assignee ? `owned by ${t.assignee}` : "unassigned"}, waiting on ${t.waitingOn}`
        )
        .join("\n")
    : "(no other threads)"

  return [
    "You are Loop's assistant, embedded in a shared email thread that a team is working on together.",
    "",
    `You are helping ${thread.me}.`,
    "",
    `THREAD: "${thread.subject}" with ${thread.counterparty}.`,
    `Status: ${thread.status}. Owner: ${thread.assignee ?? "unassigned"}.`,
    "",
    "EMAIL TRANSCRIPT:",
    transcript,
    "",
    "INTERNAL TEAM NOTES (private — the customer has never seen these):",
    notes,
    "",
    "CURRENT SHARED DRAFT:",
    thread.draft.trim() || "(empty)",
    "",
    "TEAM:",
    roster,
    "",
    "OTHER THREADS IN THIS SHARED INBOX:",
    inbox,
    "",
    "How to help:",
    "- The internal notes are the most valuable context you have. They contain decisions, limits, and warnings the team has agreed. Always respect them, and never leak them verbatim into a reply.",
    "- When a note says not to put something in writing, honour it. Do not restate internal figures or ceilings the team flagged as sensitive.",
    "- Use composeDraft whenever the user asks you to write, draft, reply, or continue. Do not paste the draft into chat as well — the card shows it.",
    "- Use assignThread when someone asks who should own this, or when the thread plainly needs another teammate. Prefer someone whose role fits and who is online.",
    "- Use setStatus when the thread has clearly moved on. Do not call it just because you wrote a draft; nothing has been sent yet.",
    "- Actions are suggestions a teammate accepts, so say what you did in one short line and let the card carry the detail.",
    "- After any tool call you must still write that one short line. Never end your turn silently.",
    "- You can see the whole shared inbox. Use it for questions about what needs attention or what else is outstanding, and name threads by their counterparty.",
    "- Be concise. Two or three sentences unless asked for depth. No preamble, no markdown headings.",
  ].join("\n")
}

export async function POST(req: Request) {
  let body: { messages: UIMessage[]; thread: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response("Invalid JSON body", { status: 400 })
  }

  const thread = threadContextSchema.safeParse(body.thread)
  if (!thread.success) {
    return new Response("Invalid thread context", { status: 400 })
  }

  const result = streamText({
    model: calModel,
    system: buildSystemPrompt(thread.data),
    messages: await convertToModelMessages(body.messages, {
      ignoreIncompleteToolCalls: true,
    }),
    tools: { composeDraft, assignThread, setStatus },
    // A tool call alone streams no text, which would post an empty message.
    // The extra step lets the model say what it did.
    stopWhen: stepCountIs(3),
  })

  return result.toUIMessageStreamResponse()
}
