import { generateObject, type UIMessage } from "ai"
import { z } from "zod"

import { suggestModel } from "@/lib/cal-agent/model"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 15

const schema = z.object({
  suggestions: z
    .array(z.string().min(1).max(70))
    .length(3)
    .describe(
      "Exactly 3 short first-person follow-up messages, ordered most likely first."
    ),
})

/** Extract a compact plain-text transcript from the recent conversation. */
function toTranscript(messages: UIMessage[], max = 8): string {
  return messages
    .slice(-max)
    .map((m) => {
      const text = (m.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join(" ")
        .trim()

      // Note any tools the assistant ran so the model can infer what was shown.
      const tools = (m.parts ?? [])
        .map((p) => (p as { type?: string }).type)
        .filter((t): t is string => Boolean(t?.startsWith("tool-")))
        .map((t) => t.replace(/^tool-/, ""))
      const toolNote = tools.length ? ` [used: ${[...new Set(tools)].join(", ")}]` : ""

      if (!text && !toolNote) return null
      const who = m.role === "user" ? "User" : "Assistant"
      return `${who}: ${text}${toolNote}`.trim()
    })
    .filter(Boolean)
    .join("\n")
}

/**
 * POST /api/cal-agent/suggestions
 * Given the conversation so far, predict the 3 things the user is most likely to
 * want next. Runs on a small, cheap model. Returns `{ suggestions: string[] }`
 * (empty on any failure — suggestions are best-effort UI sugar, never critical).
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  let messages: UIMessage[]
  let timezone: string | undefined
  try {
    ;({ messages, timezone } = (await req.json()) as {
      messages: UIMessage[]
      timezone?: string
    })
  } catch {
    return Response.json({ suggestions: [] })
  }

  const transcript = toTranscript(messages ?? [])
  if (!transcript) return Response.json({ suggestions: [] })

  try {
    const { object } = await generateObject({
      model: suggestModel,
      schema,
      system: [
        "You role-play as the USER of Loop, a calendar and email assistant.",
        "Given the conversation so far, predict the 3 things the user is most likely to want to say or ask NEXT.",
        timezone ? `The user's timezone is ${timezone}.` : "",
        "Rules:",
        "- Write each as a short, natural first-person message the user would actually send (max ~8 words).",
        '- Examples of good style: "Reschedule the 3pm to Friday", "Draft a reply to Sarah", "What am I free for a call?", "Add a lunch block tomorrow".',
        "- Make them specific and grounded in the actual conversation and what was just shown — not generic.",
        "- Cover distinct, useful next steps (don't repeat the same intent three ways).",
        "- Order them by likelihood, most likely first.",
        "- No numbering, no quotes, no trailing punctuation beyond a question mark.",
      ]
        .filter(Boolean)
        .join(" "),
      prompt: `Conversation:\n${transcript}\n\nPredict the user's 3 most likely next messages.`,
    })

    const suggestions = object.suggestions
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3)

    return Response.json({ suggestions })
  } catch {
    return Response.json({ suggestions: [] })
  }
}
