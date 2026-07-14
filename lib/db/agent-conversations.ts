"use client"

import type { UIMessage } from "ai"

import type { AgentConversation } from "@/hooks/use-agent-conversations"
import { createClient } from "@/lib/supabase/client"

const TABLE = "agent_conversations"
const LIMIT = 40

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
export async function listConversations(): Promise<AgentConversation[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, title, messages, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(LIMIT)
  if (error || !data) return []
  return (data as ConversationRow[]).map(rowToConversation)
}

/** Insert or update a conversation. user_id defaults to auth.uid() server-side. */
export async function upsertConversation(input: {
  id: string
  title: string
  messages: UIMessage[]
}): Promise<void> {
  const supabase = createClient()
  await supabase.from(TABLE).upsert({
    id: input.id,
    title: input.title,
    messages: input.messages,
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
