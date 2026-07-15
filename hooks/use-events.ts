'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  CalendarEvent,
  RecurrenceScope,
} from '@/components/event-calendar/types'
import * as eventsApi from '@/lib/api/events'
import {
  applyOptimisticEventUpdate,
  expandRecurrenceOccurrences,
} from '@/lib/optimistic-events'

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
  updateEvent: (
    event: CalendarEvent,
    recurrenceScope?: RecurrenceScope
  ) => Promise<CalendarEvent | null>
  deleteEvent: (eventId: string, recurrenceScope?: RecurrenceScope) => Promise<boolean>
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
  const syncQueued = useRef(false)

  // Keep the latest window in refs so the poll/refresh callbacks stay stable.
  const startRef = useRef(startDate)
  const endRef = useRef(endDate)

  const startKey = startDate.getTime()
  const endKey = endDate.getTime()

  useEffect(() => {
    startRef.current = startDate
    endRef.current = endDate
  }, [startDate, endDate])

  const doSync = useCallback(async (background: boolean) => {
    if (inFlight.current) {
      syncQueued.current = true
      return
    }
    inFlight.current = true
    if (background) setIsSyncing(true)
    else setIsLoading(true)
    setError(null)

    try {
      do {
        syncQueued.current = false
        const { events: fresh, connected } = await eventsApi.syncEvents({
          startDate: startRef.current,
          endDate: endRef.current,
        })
        setEvents(fresh)
        setIsConnected(connected)
      } while (syncQueued.current)
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
      // Show the whole visible series immediately, not just its first date.
      const optimistic = event.recurrence
        ? expandRecurrenceOccurrences(event, startRef.current, endRef.current)
        : [{ ...event, id: tempId }]
      const optimisticIds = new Set(optimistic.map((e) => e.id))
      setEvents((prev) => [...prev, ...optimistic])

      try {
        const created = await eventsApi.createEvent(event)
        if (created.recurrence) {
          // Let the sync swap the optimistic series for Google's real instances
          // in one step; replacing them with the single stored row would flicker.
          await doSync(true)
        } else {
          setEvents((prev) => {
            const withoutOptimistic = prev.filter((e) => !optimisticIds.has(e.id))
            return [...withoutOptimistic, created]
          })
        }
        return created
      } catch (err) {
        setEvents((prev) => prev.filter((e) => !optimisticIds.has(e.id)))
        setError(err instanceof Error ? err.message : 'Failed to create event')
        return null
      }
    },
    [doSync]
  )

  const updateEvent = useCallback(
    async (
      event: CalendarEvent,
      recurrenceScope: RecurrenceScope = 'single'
    ): Promise<CalendarEvent | null> => {
      let previous: CalendarEvent[] = []
      setEvents((prev) => {
        previous = prev
        return applyOptimisticEventUpdate(prev, event, recurrenceScope)
      })

      try {
        const updated = await eventsApi.updateEvent(event.id, event, recurrenceScope)
        setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
        if (recurrenceScope !== 'single') await doSync(true)
        return updated
      } catch (err) {
        setEvents(previous)
        setError(err instanceof Error ? err.message : 'Failed to update event')
        return null
      }
    },
    [doSync]
  )

  const deleteEvent = useCallback(
    async (
      eventId: string,
      recurrenceScope: RecurrenceScope = 'single'
    ): Promise<boolean> => {
      let previous: CalendarEvent[] = []
      setEvents((prev) => {
        previous = prev
        const selected = prev.find((event) => event.id === eventId)
        if (recurrenceScope === 'series' && selected?.recurringEventId) {
          return prev.filter(
            (event) => event.recurringEventId !== selected.recurringEventId
          )
        }
        if (recurrenceScope === 'following' && selected?.recurringEventId) {
          const boundaryMs = new Date(
            selected.originalStart ?? selected.start
          ).getTime()
          return prev.filter(
            (event) =>
              event.recurringEventId !== selected.recurringEventId ||
              new Date(event.originalStart ?? event.start).getTime() < boundaryMs
          )
        }
        return prev.filter((e) => e.id !== eventId)
      })

      try {
        await eventsApi.deleteEvent(eventId, recurrenceScope)
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
