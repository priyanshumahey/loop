"use client"

import { useCallback, useEffect, useState } from "react"

import type { CalendarEvent } from "@/components/event-calendar/types"

const STORAGE_KEY = "loop:cal:recent-events"
const MAX_RECENT = 8

interface StoredEvent {
  id: string
  title: string
  start: string
  end: string
  allDay?: boolean
  color?: CalendarEvent["color"]
  location?: string
}

const toStored = (event: CalendarEvent): StoredEvent => ({
  id: event.id,
  title: event.title,
  start: new Date(event.start).toISOString(),
  end: new Date(event.end).toISOString(),
  allDay: event.allDay,
  color: event.color,
  location: event.location,
})

const fromStored = (stored: StoredEvent): CalendarEvent => ({
  id: stored.id,
  title: stored.title,
  start: new Date(stored.start),
  end: new Date(stored.end),
  allDay: stored.allDay,
  color: stored.color,
  location: stored.location,
})

/**
 * Tracks the events a user has most recently opened, persisted to
 * localStorage so the list survives reloads and window re-syncs.
 */
export function useRecentEvents() {
  const [stored, setStored] = useState<StoredEvent[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as StoredEvent[]
        if (Array.isArray(parsed)) setStored(parsed)
      }
    } catch {
      // ignore
    }
  }, [])

  const record = useCallback((event: CalendarEvent) => {
    if (!event.id) return
    setStored((prev) => {
      const next = [toStored(event), ...prev.filter((e) => e.id !== event.id)].slice(
        0,
        MAX_RECENT
      )
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const recentEvents = stored.map(fromStored)

  return { recentEvents, record }
}
