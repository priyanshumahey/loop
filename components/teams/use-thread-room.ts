"use client"

import { HocuspocusProvider } from "@hocuspocus/provider"
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react"
import * as Y from "yjs"

import type { MemberId, ThreadStatus } from "@/components/teams/mock-data"

const COLLAB_URL = process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://127.0.0.1:8888"

export type CommentAuthor = MemberId | "assistant"

export interface LiveComment {
  id: string
  author: CommentAuthor
  body: string
  at: string
  /** Set on assistant entries: who asked, and any draft it composed. */
  askedBy?: MemberId
  draft?: string[]
}

export interface ThreadMeta {
  assignee: MemberId | null
  status: ThreadStatus
}

export interface Presence {
  id: MemberId
  name: string
  color: string
  /** True when this person currently has the draft editor focused. */
  typing: boolean
}

/**
 * Everything the team can change about a thread — comments, who owns it, and
 * who is looking at it right now — lives in one Yjs document per thread. The
 * draft body is a sibling room owned by the Plate editor.
 *
 * Snapshots are cached per Y type so `useSyncExternalStore` gets a referentially
 * stable value between changes.
 */
const arrayCache = new WeakMap<Y.Array<unknown>, unknown[]>()
const mapCache = new WeakMap<Y.Map<unknown>, Record<string, unknown>>()

const EMPTY_LIST: never[] = []
const EMPTY_MAP: Record<string, unknown> = {}

export function useThreadRoom(
  threadId: string,
  me: { id: MemberId; name: string; color: string }
) {
  // Keyed on the thread alone: switching who you are acting as updates the
  // awareness field below rather than tearing down the connection.
  const room = useMemo(() => {
    if (typeof window === "undefined") return null

    const doc = new Y.Doc()
    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: `thread:${threadId}`,
      document: doc,
    })

    return {
      doc,
      provider,
      comments: doc.getArray<LiveComment>("comments"),
      meta: doc.getMap<unknown>("meta"),
    }
  }, [threadId])

  useEffect(() => {
    return () => {
      room?.provider.destroy()
      room?.doc.destroy()
    }
  }, [room])

  const { id: meId, name: meName, color: meColor } = me

  useEffect(() => {
    room?.provider.setAwarenessField("user", {
      id: meId,
      name: meName,
      color: meColor,
      typing: false,
      threadId,
    })
  }, [room, threadId, meId, meName, meColor])

  const comments = useYArray<LiveComment>(room?.comments ?? null)
  const meta = useYMap(room?.meta ?? null)
  const presence = useAwareness(room?.provider ?? null, threadId)

  const addComment = useCallback(
    (body: string) => {
      if (!room || !body.trim()) return
      room.comments.push([
        {
          id: crypto.randomUUID(),
          author: meId,
          body: body.trim(),
          at: new Date().toISOString(),
        },
      ])
    },
    [room, meId]
  )

  /** Publish an assistant reply so the whole team sees the same answer. */
  const addAssistantReply = useCallback(
    (reply: { body: string; draft?: string[]; question?: string }) => {
      if (!room) return
      const at = new Date().toISOString()
      if (reply.question) {
        room.comments.push([
          {
            id: crypto.randomUUID(),
            author: meId,
            body: reply.question,
            at,
          },
        ])
      }
      room.comments.push([
        {
          id: crypto.randomUUID(),
          author: "assistant",
          askedBy: meId,
          body: reply.body,
          draft: reply.draft,
          at,
        },
      ])
    },
    [room, meId]
  )

  const setAssignee = useCallback(
    (assignee: MemberId | null) => room?.meta.set("assignee", assignee),
    [room]
  )

  const setStatus = useCallback(
    (status: ThreadStatus) => room?.meta.set("status", status),
    [room]
  )

  const setTyping = useCallback(
    (typing: boolean) =>
      room?.provider.setAwarenessField("user", {
        id: meId,
        name: meName,
        color: meColor,
        typing,
        threadId,
      }),
    [room, threadId, meId, meName, meColor]
  )

  return {
    comments,
    assignee: (meta.assignee as MemberId | null | undefined) ?? undefined,
    status: meta.status as ThreadStatus | undefined,
    presence,
    addComment,
    addAssistantReply,
    setAssignee,
    setStatus,
    setTyping,
  }
}

function useYArray<T>(yarray: Y.Array<T> | null): T[] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!yarray) return () => {}
      const handler = () => {
        arrayCache.set(yarray as Y.Array<unknown>, yarray.toArray())
        onChange()
      }
      // Remote state can land between creating the doc and subscribing, and Yjs
      // won't replay it, so refresh once up front.
      arrayCache.set(yarray as Y.Array<unknown>, yarray.toArray())
      yarray.observe(handler)
      return () => yarray.unobserve(handler)
    },
    [yarray]
  )

  const getSnapshot = useCallback(() => {
    if (!yarray) return EMPTY_LIST as T[]
    const key = yarray as Y.Array<unknown>
    let cached = arrayCache.get(key)
    if (!cached) {
      cached = yarray.toArray()
      arrayCache.set(key, cached)
    }
    return cached as T[]
  }, [yarray])

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_LIST as T[])
}

function useYMap(ymap: Y.Map<unknown> | null): Record<string, unknown> {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!ymap) return () => {}
      const handler = () => {
        mapCache.set(ymap, Object.fromEntries(ymap.entries()))
        onChange()
      }
      mapCache.set(ymap, Object.fromEntries(ymap.entries()))
      ymap.observe(handler)
      return () => ymap.unobserve(handler)
    },
    [ymap]
  )

  const getSnapshot = useCallback(() => {
    if (!ymap) return EMPTY_MAP
    let cached = mapCache.get(ymap)
    if (!cached) {
      cached = Object.fromEntries(ymap.entries())
      mapCache.set(ymap, cached)
    }
    return cached
  }, [ymap])

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_MAP)
}

const awarenessCache = new WeakMap<object, Presence[]>()

function useAwareness(
  provider: HocuspocusProvider | null,
  threadId: string
): Presence[] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!provider) return () => {}
      const awareness = provider.awareness
      if (!awareness) return () => {}
      const handler = () => {
        awarenessCache.set(awareness, readPresence(awareness, threadId))
        onChange()
      }
      awarenessCache.set(awareness, readPresence(awareness, threadId))
      awareness.on("change", handler)
      return () => awareness.off("change", handler)
    },
    [provider, threadId]
  )

  const getSnapshot = useCallback(() => {
    const awareness = provider?.awareness
    if (!awareness) return EMPTY_LIST as Presence[]
    let cached = awarenessCache.get(awareness)
    if (!cached) {
      cached = readPresence(awareness, threadId)
      awarenessCache.set(awareness, cached)
    }
    return cached
  }, [provider, threadId])

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_LIST as Presence[])
}

function readPresence(
  awareness: { getStates: () => Map<number, Record<string, unknown>> },
  threadId: string
): Presence[] {
  const seen = new Map<MemberId, Presence>()
  for (const state of awareness.getStates().values()) {
    const user = state.user as (Presence & { threadId?: string }) | undefined
    // Providers can share a socket, so only trust states tagged for this thread.
    if (!user?.id || user.threadId !== threadId) continue
    // One entry per person even if they have several tabs open.
    const existing = seen.get(user.id)
    seen.set(user.id, {
      ...user,
      typing: Boolean(existing?.typing) || Boolean(user.typing),
    })
  }
  return [...seen.values()]
}
