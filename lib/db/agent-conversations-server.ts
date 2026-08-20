import "server-only"

import type { UIMessage } from "ai"

import type { createClient } from "@/lib/supabase/server"
import type { AgentConversationScope } from "@/lib/db/agent-conversations"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

const TABLE = "agent_conversations"

/** Derive a title from the first user message's text (mirrors the client). */
function deriveTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user")
  if (!firstUser) return "New chat"
  const text = firstUser.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join(" ")
    .trim()
  if (!text) return "New chat"
  return text.length > 48 ? `${text.slice(0, 48)}…` : text
}

/**
 * Persist a conversation's messages from the server — a safety net for when the
 * client disconnects (tab closed, navigation) before it can save the assistant's
 * reply. Inserts a new row with a derived title, or updates only the messages of
 * an existing row so a client-set or renamed title is never clobbered. Relies on
 * RLS: `user_id` defaults to `auth.uid()` and every policy checks ownership.
 */
export async function persistConversationServer(
  supabase: ServerSupabase,
  input: {
    id: string
    messages: UIMessage[]
    scope?: AgentConversationScope
    documentId?: string | null
  },
): Promise<void> {
  if (input.messages.length === 0) return

  const { data } = await supabase
    .from(TABLE)
    .select("id")
    .eq("id", input.id)
    .maybeSingle()

  if (data) {
    await supabase.from(TABLE).update({ messages: input.messages }).eq("id", input.id)
  } else {
    await supabase.from(TABLE).insert({
      id: input.id,
      title: deriveTitle(input.messages),
      messages: input.messages,
      scope: input.scope ?? "calendar",
      document_id: input.documentId ?? null,
    })
  }
}
