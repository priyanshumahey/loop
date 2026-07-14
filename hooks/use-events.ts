'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { CalendarEvent } from '@/components/event-calendar/types'
import * as eventsApi from '@/lib/api/events'

interface UseEventsOptions {
  /** Start of the visible window to sync/fetch. */
  startDate: Date
  /** End of the visible window to sync/fetch. */
  endDate: Date
  /** Background poll interval in ms (0 disables). Default 2 minutes. */
  pollIntervalMs?: number
}

interface UseEventsReturn {
  events: CalendarEvent[]
  /** True only during the very first load. */
  isLoading: boolean
  /** True during background pulls (range change, poll, manual refresh). */
  isSyncing: boolean
  /** Whether the user has Google Calendar connected. */
  isConnected: boolean
  error: string | null
  /** Manually trigger a Google pull for the current window. */
  refresh: () => Promise<void>
  addEvent: (event: CalendarEvent) => Promise<CalendarEvent | null>
  updateEvent: (event: CalendarEvent) => Promise<CalendarEvent | null>
  deleteEvent: (eventId: string) => Promise<boolean>
}

const DEBOUNCE_MS = 400

/**
 * Manages calendar events for a visible window, syncing with Google Calendar:
 *   - pulls on mount,
 *   - pulls (debounced) whenever the window changes,
 *   - polls in the background while mounted,
 *   - exposes a manual refresh,
 * and provides optimistic CRUD that mirrors changes back to Google via the API.
 */
export function useEvents({
  startDate,
  endDate,
  pollIntervalMs = 120_000,
}: UseEventsOptions): UseEventsReturn {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasLoaded = useRef(false)
  const inFlight = useRef(false)

  // Keep the latest window in refs so the poll/refresh callbacks stay stable.
  const startRef = useRef(startDate)
  const endRef = useRef(endDate)
  startRef.current = startDate
  endRef.current = endDate

  const startKey = startDate.getTime()
  const endKey = endDate.getTime()

  const doSync = useCallback(async (background: boolean) => {
    if (inFlight.current) return
    inFlight.current = true
    if (background) setIsSyncing(true)
    else setIsLoading(true)
    setError(null)

    try {
      const { events: fresh, connected } = await eventsApi.syncEvents({
        startDate: startRef.current,
        endDate: endRef.current,
      })
      setEvents(fresh)
      setIsConnected(connected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync events')
    } finally {
      inFlight.current = false
      setIsLoading(false)
      setIsSyncing(false)
    }
  }, [])

  // Initial load + debounced re-sync when the window changes.
  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true
      void doSync(false)
      return
    }
    const t = setTimeout(() => void doSync(true), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [startKey, endKey, doSync])

  // Background polling.
  useEffect(() => {
    if (!pollIntervalMs) return
    const id = setInterval(() => void doSync(true), pollIntervalMs)
    return () => clearInterval(id)
  }, [pollIntervalMs, doSync])

  const refresh = useCallback(() => doSync(true), [doSync])

  const addEvent = useCallback(
    async (event: CalendarEvent): Promise<CalendarEvent | null> => {
      const tempId = event.id || `temp-${Date.now()}`
      const optimistic: CalendarEvent = { ...event, id: tempId }
      setEvents((prev) => [...prev, optimistic])

      try {
        const created = await eventsApi.createEvent(event)
        setEvents((prev) => prev.map((e) => (e.id === optimistic.id ? created : e)))
        return created
      } catch (err) {
        setEvents((prev) => prev.filter((e) => e.id !== optimistic.id))
        setError(err instanceof Error ? err.message : 'Failed to create event')
        return null
      }
    },
    []
  )

  const updateEvent = useCallback(
    async (event: CalendarEvent): Promise<CalendarEvent | null> => {
      let previous: CalendarEvent[] = []
      setEvents((prev) => {
        previous = prev
        return prev.map((e) => (e.id === event.id ? event : e))
      })

      try {
        const updated = await eventsApi.updateEvent(event.id, event)
        setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
        return updated
      } catch (err) {
        setEvents(previous)
        setError(err instanceof Error ? err.message : 'Failed to update event')
        return null
      }
    },
    []
  )

  const deleteEvent = useCallback(
    async (eventId: string): Promise<boolean> => {
      let previous: CalendarEvent[] = []
      setEvents((prev) => {
        previous = prev
        return prev.filter((e) => e.id !== eventId)
      })

      try {
        await eventsApi.deleteEvent(eventId)
        return true
      } catch (err) {
        setEvents(previous)
        setError(err instanceof Error ? err.message : 'Failed to delete event')
        return false
      }
    },
    []
  )

  return {
    events,
    isLoading,
    isSyncing,
    isConnected,
    error,
    refresh,
    addEvent,
    updateEvent,
    deleteEvent,
  }
}
