'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import * as emailsApi from '@/lib/api/emails'
import type { Email } from '@/lib/api/emails'

const DEBOUNCE_MS = 400

interface UseEmailsOptions {
  /** Number of messages to fetch per page. Default 20. */
  maxResults?: number
  /** Optional Gmail search query (e.g. 'is:unread', 'from:foo@bar.com'). */
  query?: string
  /** Search all mail (archived/sent/etc.) rather than just the inbox. */
  allMail?: boolean
  /** Background poll interval in ms (0 disables). Default 2 minutes. */
  pollIntervalMs?: number
}

interface UseEmailsReturn {
  emails: Email[]
  /** True only during the very first load. */
  isLoading: boolean
  /** True during background refreshes / manual refresh. */
  isRefreshing: boolean
  /** Whether the user has Google connected. */
  isConnected: boolean
  /** True while a `loadMore()` page fetch is in flight. */
  isLoadingMore: boolean
  /** Whether more pages are available. */
  hasMore: boolean
  error: string | null
  /** Re-fetch the first page from Gmail. */
  refresh: () => Promise<void>
  /** Append the next page of older messages. */
  loadMore: () => Promise<void>
}

/**
 * Fetches the user's Gmail inbox and keeps it fresh:
 *   - loads on mount,
 *   - polls in the background while mounted,
 *   - exposes a manual refresh and cursor-based `loadMore`.
 */
export function useEmails({
  maxResults = 20,
  query,
  allMail,
  pollIntervalMs = 120_000,
}: UseEmailsOptions = {}): UseEmailsReturn {
  const [emails, setEmails] = useState<Email[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasLoaded = useRef(false)
  const inFlight = useRef(false)

  const load = useCallback(
    async (background: boolean) => {
      if (inFlight.current) return
      inFlight.current = true
      if (background) setIsRefreshing(true)
      else setIsLoading(true)
      setError(null)

      try {
        const { emails: fresh, connected, nextPageToken: token } =
          await emailsApi.listEmails({ maxResults, query, allMail })
        setEmails(fresh)
        setIsConnected(connected)
        setNextPageToken(token)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load emails')
      } finally {
        inFlight.current = false
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [maxResults, query, allMail]
  )

  // Initial load, then debounced background reloads when the query changes.
  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true
      void load(false)
      return
    }
    const t = setTimeout(() => void load(true), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [load])

  // Background polling.
  useEffect(() => {
    if (!pollIntervalMs) return
    const id = setInterval(() => void load(true), pollIntervalMs)
    return () => clearInterval(id)
  }, [pollIntervalMs, load])

  const refresh = useCallback(() => load(true), [load])

  const loadMore = useCallback(async () => {
    if (!nextPageToken || isLoadingMore) return
    setIsLoadingMore(true)
    setError(null)
    try {
      const { emails: older, nextPageToken: token } = await emailsApi.listEmails({
        maxResults,
        query,
        allMail,
        pageToken: nextPageToken,
      })
      setEmails((prev) => {
        const seen = new Set(prev.map((e) => e.id))
        return [...prev, ...older.filter((e) => !seen.has(e.id))]
      })
      setNextPageToken(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more emails')
    } finally {
      setIsLoadingMore(false)
    }
  }, [nextPageToken, isLoadingMore, maxResults, query, allMail])

  return {
    emails,
    isLoading,
    isRefreshing,
    isConnected,
    isLoadingMore,
    hasMore: nextPageToken !== null,
    error,
    refresh,
    loadMore,
  }
}
