"use client"

import { useCallback, useEffect, useState } from "react"

import type { SchedulingBooking } from "@/components/scheduling/types"
import {
  fetchBookings,
  manageBooking,
} from "@/lib/api/scheduling"

export function useSchedulingBookings() {
  const [bookings, setBookings] = useState<SchedulingBooking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchUpcoming = useCallback(() => fetchBookings("upcoming"), [])

  useEffect(() => {
    let cancelled = false
    fetchUpcoming()
      .then((data) => {
        if (cancelled) return
        setBookings(data)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "Failed to load bookings"
          )
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchUpcoming])

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      setBookings(await fetchUpcoming())
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to refresh bookings"
      )
    } finally {
      setIsRefreshing(false)
    }
  }, [fetchUpcoming])

  const act = useCallback(
    async (
      bookingId: string,
      action: "confirm" | "reject" | "cancel",
      reason?: string
    ) => {
      setActionId(bookingId)
      setError(null)
      try {
        const result = await manageBooking(bookingId, action, reason)
        setBookings((current) =>
          current.map((booking) =>
            booking.id === bookingId
              ? {
                  ...booking,
                  status: result.status,
                  providerSyncStatus: "pending",
                  providerSyncError: null,
                }
              : booking
          )
        )
        return true
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Failed to update booking"
        )
        return false
      } finally {
        setActionId(null)
      }
    },
    []
  )

  return {
    bookings,
    isLoading,
    isRefreshing,
    actionId,
    error,
    refresh,
    act,
  }
}