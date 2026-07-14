"use client"

import type { UIMessage } from "ai"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  deleteConversationDb,
  listConversations,
  renameConversationDb,
  upsertConversation,
} from "@/lib/db/agent-conversations"

const CONV_KEY = "loop:agent:conversations"
const ACTIVE_KEY = "loop:agent:active"
const OPEN_KEY = "loop:agent:open"
const MAX_CONVERSATIONS = 40

export interface AgentConversation {
  id: string
  title: string
  /** Full UIMessage history, including completed tool-call parts. */
  messages: UIMessage[]
  createdAt: number
  updatedAt: number
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

/** Derive a title from the first user message's text. */
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
 * localStorage-backed store for the calendar agent's conversations, synced to
 * Supabase. localStorage is an instant cache; the `agent_conversations` table
 * is the source of truth (enabling cross-device sync). The full UIMessage
 * history (including completed tool results) is stored so chats survive reloads
 * and are shared across the `/home` and `/cal` surfaces.
 *
 * A "new chat" is a fresh draft id that is NOT written to storage until its
 * first turn completes — so empty drafts never clutter the list, and switching
 * conversations (which remounts the agent) never happens mid-stream.
 */
export function useAgentConversations() {
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [activeId, setActiveId] = useState<string>("")
  /** Conversations currently open as tabs, in tab order. */
  const [openIds, setOpenIds] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Restore from storage on mount.
  useEffect(() => {
    let convs: AgentConversation[] = []
    try {
      const raw = localStorage.getItem(CONV_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      if (Array.isArray(parsed)) convs = parsed
    } catch {
      // ignore
    }
    setConversations(convs)

    const existing = new Set(convs.map((c) => c.id))
    let open: string[] = []
    try {
      const raw = localStorage.getItem(OPEN_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      if (Array.isArray(parsed)) open = parsed.filter((id) => existing.has(id))
    } catch {
      // ignore
    }

    let active = ""
    try {
      active = localStorage.getItem(ACTIVE_KEY) ?? ""
    } catch {
      // ignore
    }
    // Keep the stored active id even when it's an unsaved draft, so the
    // conversation id stays stable across a refresh — otherwise an in-flight
    // stream can't be resumed (its id would change on every reload).
    const restoredActive = active || uid()
    if (existing.has(restoredActive) && !open.includes(restoredActive)) {
      open = [...open, restoredActive]
    }
    setOpenIds(open)
    setActiveId(restoredActive)
    setHydrated(true)

    // Reconcile with Supabase (source of truth) in the background. Merge so
    // conversations created locally aren't lost, and migrate any local-only
    // ones up to the server.
    let cancelled = false
    void (async () => {
      const remote = await listConversations()
      if (cancelled) return
      const remoteIds = new Set(remote.map((c) => c.id))
      const localOnly = convs.filter(
        (c) => !remoteIds.has(c.id) && c.messages.length > 0
      )
      for (const c of localOnly) {
        void upsertConversation({ id: c.id, title: c.title, messages: c.messages })
      }
      if (remote.length === 0 && localOnly.length === 0) return
      setConversations((prev) => {
        const byId = new Map<string, AgentConversation>()
        for (const c of remote) byId.set(c.id, c)
        // Keep local versions that are newer or not on the server yet.
        for (const c of prev) {
          const r = byId.get(c.id)
          if (!r || c.updatedAt > r.updatedAt) byId.set(c.id, c)
        }
        return [...byId.values()]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_CONVERSATIONS)
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(CONV_KEY, JSON.stringify(conversations))
    } catch {
      // ignore (quota / unavailable)
    }
  }, [conversations, hydrated])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(openIds))
    } catch {
      // ignore
    }
  }, [openIds, hydrated])

  useEffect(() => {
    if (!hydrated || !activeId) return
    try {
      localStorage.setItem(ACTIVE_KEY, activeId)
    } catch {
      // ignore
    }
  }, [activeId, hydrated])

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  )

  /** Open tabs resolved to conversations, in tab order. */
  const openConversations = useMemo(() => {
    const byId = new Map(conversations.map((c) => [c.id, c]))
    return openIds
      .map((id) => byId.get(id))
      .filter((c): c is AgentConversation => c !== undefined)
  }, [conversations, openIds])

  /** True when the active chat is a fresh, not-yet-saved draft. */
  const isDraft = useMemo(
    () => !conversations.some((c) => c.id === activeId),
    [conversations, activeId]
  )

  const newChat = useCallback(() => setActiveId(uid()), [])

  const select = useCallback((id: string) => {
    setActiveId(id)
    setOpenIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  /** Close a tab without deleting the conversation (stays in History). */
  const closeTab = useCallback((id: string) => {
    setOpenIds((prev) => {
      const remaining = prev.filter((openId) => openId !== id)
      setActiveId((current) =>
        current === id ? remaining[remaining.length - 1] ?? uid() : current
      )
      return remaining
    })
  }, [])

  const remove = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    setOpenIds((prev) => prev.filter((openId) => openId !== id))
    setActiveId((prev) => (prev === id ? uid() : prev))
    void deleteConversationDb(id)
  }, [])

  const rename = useCallback((id: string, title: string) => {
    const next = title.trim()
    if (!next) return
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: next, updatedAt: Date.now() } : c))
    )
    void renameConversationDb(id, next)
  }, [])

  /**
   * Upsert the active conversation with a completed message history. Called
   * only when a turn has fully finished, so every tool-call part carries its
   * `output` and no partial/streaming state is written to storage.
   */
  const persist = useCallback(
    (messages: UIMessage[]) => {
      if (messages.length === 0) return
      const now = Date.now()
      const existing = conversations.find((c) => c.id === activeId)
      const title =
        existing && existing.title !== "New chat"
          ? existing.title
          : deriveTitle(messages)
      const updated: AgentConversation = {
        id: activeId,
        title,
        messages,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      setConversations((prev) =>
        [updated, ...prev.filter((c) => c.id !== activeId)].slice(
          0,
          MAX_CONVERSATIONS
        )
      )
      // A newly-saved draft becomes an open tab.
      setOpenIds((prev) => (prev.includes(activeId) ? prev : [...prev, activeId]))
      // Mirror to Supabase (source of truth).
      void upsertConversation({ id: activeId, title, messages })
    },
    [activeId, conversations]
  )

  return {
    conversations,
    activeId,
    activeConversation,
    openConversations,
    isDraft,
    hydrated,
    newChat,
    select,
    closeTab,
    remove,
    rename,
    persist,
  }
}
