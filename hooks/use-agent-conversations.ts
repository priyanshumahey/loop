"use client"

import type { UIMessage } from "ai"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  type AgentConversationScope,
  deleteConversationDb,
  listConversations,
  renameConversationDb,
  upsertConversation,
} from "@/lib/db/agent-conversations"

const CONV_KEY = "loop:agent:conversations"
const ACTIVE_KEY = "loop:agent:active"
const OPEN_KEY = "loop:agent:open"
const FAV_KEY = "loop:agent:favorites"
const MAX_CONVERSATIONS = 40

function storageKeys(scope: AgentConversationScope, documentId?: string | null) {
  if (scope === "calendar" && !documentId) {
    return {
      conversations: CONV_KEY,
      active: ACTIVE_KEY,
      open: OPEN_KEY,
      favorites: FAV_KEY,
    }
  }
  const namespace = `loop:agent:${scope}:${documentId ?? "root"}`
  return {
    conversations: `${namespace}:conversations`,
    active: `${namespace}:active`,
    open: `${namespace}:open`,
    favorites: `${namespace}:favorites`,
  }
}

export interface AgentConversation {
  id: string
  title: string
  /** Full UIMessage history, including tool calls and approval checkpoints. */
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

type ConversationStorageKeys = ReturnType<typeof storageKeys>

function readStoredArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readStoredValue(key: string): string {
  try {
    return localStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}

function restoreStoredState({
  keys,
  legacyKeys,
  syncUrl,
  initialChatId,
}: {
  keys: ConversationStorageKeys
  legacyKeys: ConversationStorageKeys | null
  syncUrl: boolean
  initialChatId?: string
}) {
  const byId = new Map<string, AgentConversation>()
  const current = readStoredArray<AgentConversation>(keys.conversations)
  const legacy = legacyKeys
    ? readStoredArray<AgentConversation>(legacyKeys.conversations)
    : []
  for (const conversation of [...legacy, ...current]) {
    const existing = byId.get(conversation.id)
    if (!existing || conversation.updatedAt >= existing.updatedAt) {
      byId.set(conversation.id, conversation)
    }
  }
  const conversations = [...byId.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS)
  const existingIds = new Set(conversations.map((conversation) => conversation.id))

  const legacyOpen = legacyKeys
    ? readStoredArray<string>(legacyKeys.open)
    : []
  let openIds = [
    ...new Set([...readStoredArray<string>(keys.open), ...legacyOpen]),
  ].filter((id) => existingIds.has(id))

  const legacyFavorites = legacyKeys
    ? readStoredArray<string>(legacyKeys.favorites)
    : []
  const favoriteIds = [
    ...new Set([
      ...readStoredArray<string>(keys.favorites),
      ...legacyFavorites,
    ]),
  ].filter((id) => existingIds.has(id))

  const active =
    readStoredValue(keys.active) ||
    (legacyKeys ? readStoredValue(legacyKeys.active) : "")
  const activeId = (syncUrl && initialChatId) || active || uid()
  if (existingIds.has(activeId) && !openIds.includes(activeId)) {
    openIds = [...openIds, activeId]
  }

  return { conversations, openIds, favoriteIds, activeId }
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
 *
 * When `syncUrl` is set, the active conversation id is mirrored to the `?c=<id>`
 * query param so each chat has its own URL — opening `/home?c=<id>` (e.g. in a
 * new browser tab) restores that conversation.
 */
export function useAgentConversations(
  options: {
    syncUrl?: boolean
    initialChatId?: string
    scope?: AgentConversationScope
    documentId?: string | null
    migrateFromScope?: AgentConversationScope
  } = {}
) {
  const {
    syncUrl = false,
    initialChatId,
    scope = "calendar",
    documentId = null,
    migrateFromScope,
  } = options
  const keys = useMemo(
    () => storageKeys(scope, documentId),
    [documentId, scope]
  )
  const legacyKeys = useMemo(
    () =>
      migrateFromScope ? storageKeys(migrateFromScope, null) : null,
    [migrateFromScope]
  )
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [activeId, setActiveId] = useState<string>("")
  /** Conversations currently open as tabs, in tab order. */
  const [openIds, setOpenIds] = useState<string[]>([])
  /** Ids the user has pinned as favorites. */
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Restore from storage on mount.
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      const stored = restoreStoredState({
        keys,
        legacyKeys,
        syncUrl,
        initialChatId,
      })
      if (cancelled) return
      setConversations(stored.conversations)
      setOpenIds(stored.openIds)
      setFavoriteIds(stored.favoriteIds)
      setActiveId(stored.activeId)
      setHydrated(true)

      // Reconcile with Supabase (source of truth) in the background. Merge so
      // conversations created locally aren't lost, and migrate any local-only
      // ones up to the server.
      const [currentRemote, legacyRemote] = await Promise.all([
        listConversations({ scope, documentId }),
        migrateFromScope
          ? listConversations({ scope: migrateFromScope, documentId: null })
          : Promise.resolve([]),
      ])
      if (cancelled) return
      for (const conversation of legacyRemote) {
        void upsertConversation({
          id: conversation.id,
          title: conversation.title,
          messages: conversation.messages,
          scope,
          documentId,
        })
      }
      const remoteById = new Map<string, AgentConversation>()
      for (const conversation of [...legacyRemote, ...currentRemote]) {
        const current = remoteById.get(conversation.id)
        if (!current || conversation.updatedAt > current.updatedAt) {
          remoteById.set(conversation.id, conversation)
        }
      }
      const remote = [...remoteById.values()]
      const remoteIds = new Set(remote.map((c) => c.id))
      const localOnly = stored.conversations.filter(
        (c) => !remoteIds.has(c.id) && c.messages.length > 0
      )
      for (const c of localOnly) {
        void upsertConversation({
          id: c.id,
          title: c.title,
          messages: c.messages,
          scope,
          documentId,
        })
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
    })
    return () => {
      cancelled = true
    }
  }, [documentId, initialChatId, keys, legacyKeys, migrateFromScope, scope, syncUrl])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(keys.conversations, JSON.stringify(conversations))
    } catch {
      // ignore (quota / unavailable)
    }
  }, [conversations, hydrated, keys.conversations])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(keys.open, JSON.stringify(openIds))
    } catch {
      // ignore
    }
  }, [openIds, hydrated, keys.open])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(keys.favorites, JSON.stringify(favoriteIds))
    } catch {
      // ignore
    }
  }, [favoriteIds, hydrated, keys.favorites])

  useEffect(() => {
    if (!hydrated || !activeId) return
    try {
      localStorage.setItem(keys.active, activeId)
    } catch {
      // ignore
    }
  }, [activeId, hydrated, keys.active])

  // Mirror the active conversation to the URL so each chat has its own address.
  useEffect(() => {
    if (!syncUrl || !hydrated || !activeId) return
    const url = new URL(window.location.href)
    if (url.searchParams.get("c") === activeId) return
    url.searchParams.set("c", activeId)
    window.history.replaceState(window.history.state, "", url)
  }, [syncUrl, hydrated, activeId])

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
    setFavoriteIds((prev) => prev.filter((favId) => favId !== id))
    setActiveId((prev) => (prev === id ? uid() : prev))
    void deleteConversationDb(id)
  }, [])

  /** Pin/unpin a conversation to the Favorites section. */
  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) =>
      prev.includes(id) ? prev.filter((favId) => favId !== id) : [id, ...prev]
    )
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
    * Upsert the active conversation at durable checkpoints: the user's message,
    * approval requests and decisions, and completed assistant turns. Ephemeral
    * token-by-token streaming snapshots are not written.
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
      void upsertConversation({
        id: activeId,
        title,
        messages,
        scope,
        documentId,
      })
    },
    [activeId, conversations, documentId, scope]
  )

  return {
    conversations,
    activeId,
    activeConversation,
    openConversations,
    favoriteIds,
    isDraft,
    hydrated,
    newChat,
    select,
    closeTab,
    remove,
    rename,
    toggleFavorite,
    persist,
  }
}
