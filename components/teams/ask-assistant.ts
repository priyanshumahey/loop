export interface ThreadContext {
  subject: string
  counterparty: string
  status: string
  assignee: string | null
  messages: { from: string; sentAt: string; body: string }[]
  comments: { author: string; body: string }[]
  draft: string
  /** Who is asking, so the assistant can answer "what needs me?". */
  me: string
  /** The roster, so it can suggest an owner by name and skill. */
  team: { name: string; role: string; online: boolean }[]
  /** The rest of the inbox, so it can answer across threads. */
  otherThreads: {
    subject: string
    counterparty: string
    status: string
    assignee: string | null
    waitingOn: string
  }[]
}

/** A change the assistant wants to make to the thread itself. */
export type AssistantAction =
  | { kind: "assign"; member: string; reason: string }
  | { kind: "status"; status: "open" | "waiting" | "closed"; reason: string }

export interface AssistantReply {
  text: string
  /** Present when the assistant composed a reply for the shared draft. */
  draft?: string[]
  /** Present when it wants to reassign the thread or move its status. */
  actions: AssistantAction[]
}

/**
 * Ask the thread assistant and stream the answer back.
 *
 * The reply is consumed here rather than by `useChat` because the result is
 * committed to the thread's Yjs document — the assistant is a participant in
 * the team's conversation, not a private side-channel, so everyone ends up
 * seeing the same final message.
 */
export async function askAssistant(
  prompt: string,
  context: ThreadContext,
  onPartial?: (text: string) => void
): Promise<AssistantReply> {
  const response = await fetch("/api/teams-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text: prompt }],
        },
      ],
      thread: context,
    }),
  })

  if (!response.ok || !response.body) {
    throw new Error("The assistant is unavailable right now.")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  let draft: string[] | undefined
  const actions: AssistantAction[] = []

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const chunks = buffer.split("\n\n")
    buffer = chunks.pop() ?? ""

    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue
        const payload = line.slice(6).trim()
        if (!payload || payload === "[DONE]") continue

        let event: unknown
        try {
          event = JSON.parse(payload)
        } catch {
          continue
        }

        // Tool outputs arrive without a tool name, so each one identifies
        // itself: a draft carries paragraphs, an action carries `kind`.
        const record = event as {
          type?: string
          delta?: string
          output?: { paragraphs?: string[] } & Partial<AssistantAction>
        }
        if (record.type === "text-delta" && record.delta) {
          text += record.delta
          onPartial?.(text)
        }
        if (record.output?.paragraphs) {
          draft = record.output.paragraphs
        }
        if (record.output?.kind) {
          actions.push(record.output as AssistantAction)
        }
      }
    }
  }

  return { text: text.trim(), draft, actions }
}
