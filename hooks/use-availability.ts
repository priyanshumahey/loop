"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type {
  AvailabilityRangeAction,
  AvailabilitySlot,
} from "@/components/scheduling/types"
import * as availabilityApi from "@/lib/api/availability"

/**
 * Weekly availability for a date range. Requests are versioned so a slow
 * response for an older range can never overwrite a newer one.
 */
export function useAvailability(startDate: Date, endDate: Date) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  // Compare by timestamp so a caller re-creating equivalent Dates each render
  // doesn't retrigger the fetch.
  const startKey = startDate.getTime()
  const endKey = endDate.getTime()

  // Returns the promise without touching state; callers own the setState so the
  // effect below stays free of synchronous updates.
  const fetchRange = useCallback(
    () => availabilityApi.fetchAvailability(new Date(startKey), new Date(endKey)),
    [startKey, endKey]
  )

  const applyResult = useCallback(
    (request: number, promise: Promise<AvailabilitySlot[]>) =>
      promise
        .then((fresh) => {
          if (request !== requestId.current) return
          setSlots(fresh)
          setError(null)
        })
        .catch((cause: unknown) => {
          if (request !== requestId.current) return
          setError(
            cause instanceof Error ? cause.message : "Failed to load availability"
          )
        })
        .finally(() => {
          if (request === requestId.current) setIsLoading(false)
        }),
    []
  )

  useEffect(() => {
    void applyResult(++requestId.current, fetchRange())
  }, [fetchRange, applyResult])

  const refresh = useCallback(
    () => applyResult(++requestId.current, fetchRange()),
    [fetchRange, applyResult]
  )

  const updateRange = useCallback(
    async (
      start: Date,
      end: Date,
      action: AvailabilityRangeAction,
      eventTypeId: string | null
    ) => {
      setIsSaving(true)
      setError(null)
      try {
        await availabilityApi.setAvailabilityRange(start, end, action, eventTypeId)
        await refresh()
        return true
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to update availability"
        )
        return false
      } finally {
        setIsSaving(false)
      }
    },
    [refresh]
  )

  return { slots, isLoading, isSaving, error, updateRange, refresh }
}
