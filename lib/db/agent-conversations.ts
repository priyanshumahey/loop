"use client"

import type { UIMessage } from "ai"

import type { AgentConversation } from "@/hooks/use-agent-conversations"
import { createClient } from "@/lib/supabase/client"

const TABLE = "agent_conversations"
const LIMIT = 40

export type AgentConversationScope = "calendar" | "documents" | "document"

interface ConversationRow {
  id: string
  title: string
  messages: UIMessage[]
  created_at: string
  updated_at: string
}

function rowToConversation(row: ConversationRow): AgentConversation {
  return {
    id: row.id,
    title: row.title,
    messages: Array.isArray(row.messages) ? row.messages : [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

/** Fetch the current user's conversations (most recent first). Empty when the
 * user isn't authenticated — RLS simply returns no rows. */
export async function listConversations(options: {
  scope?: AgentConversationScope
  documentId?: string | null
} = {}): Promise<AgentConversation[]> {
  const supabase = createClient()
  let query = supabase
    .from(TABLE)
    .select("id, title, messages, created_at, updated_at")
    .eq("scope", options.scope ?? "calendar")
    .order("updated_at", { ascending: false })
    .limit(LIMIT)
  query = options.documentId
    ? query.eq("document_id", options.documentId)
    : query.is("document_id", null)
  const { data, error } = await query
  if (error || !data) return []
  return (data as ConversationRow[]).map(rowToConversation)
}

/** Insert or update a conversation. user_id defaults to auth.uid() server-side. */
export async function upsertConversation(input: {
  id: string
  title: string
  messages: UIMessage[]
  scope?: AgentConversationScope
  documentId?: string | null
}): Promise<void> {
  const supabase = createClient()
  await supabase.from(TABLE).upsert({
    id: input.id,
    title: input.title,
    messages: input.messages,
    scope: input.scope ?? "calendar",
    document_id: input.documentId ?? null,
    updated_at: new Date().toISOString(),
  })
}

export async function renameConversationDb(id: string, title: string): Promise<void> {
  const supabase = createClient()
  await supabase.from(TABLE).update({ title }).eq("id", id)
}

export async function deleteConversationDb(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from(TABLE).delete().eq("id", id)
}
