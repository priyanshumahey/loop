"use client"

import { useCallback, useEffect, useState } from "react"

import type { SchedulingEventType } from "@/components/scheduling/types"
import {
  deleteEventType,
  fetchEventTypes,
  saveEventType,
  type EventTypeInput,
} from "@/lib/api/scheduling"

export function useSchedulingEventTypes() {
  const [eventTypes, setEventTypes] = useState<SchedulingEventType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchEventTypes()
      .then((data) => {
        if (cancelled) return
        setEventTypes(data)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(
          cause instanceof Error ? cause.message : "Failed to load meeting types"
        )
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const save = useCallback(async (input: EventTypeInput) => {
    setIsSaving(true)
    setError(null)
    try {
      const saved = await saveEventType(input)
      setEventTypes((current) => {
        const exists = current.some((eventType) => eventType.id === saved.id)
        return exists
          ? current.map((eventType) =>
              eventType.id === saved.id ? saved : eventType
            )
          : [...current, saved]
      })
      return saved
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save meeting type")
      return null
    } finally {
      setIsSaving(false)
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    setIsSaving(true)
    setError(null)
    try {
      await deleteEventType(id)
      setEventTypes((current) =>
        current.filter((eventType) => eventType.id !== id)
      )
      return true
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete meeting type")
      return false
    } finally {
      setIsSaving(false)
    }
  }, [])

  return { eventTypes, isLoading, isSaving, error, save, remove }
}