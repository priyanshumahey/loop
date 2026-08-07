"use client"

import { addDays, format, startOfDay } from "date-fns"
import {
  CalendarCheckIcon,
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  VideoIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import type {
  ConfirmedBooking,
  PublicEventType,
  PublicScheduleSlot,
} from "@/components/scheduling/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import * as scheduleApi from "@/lib/api/schedule"
import { cn } from "@/lib/utils"

function timeZoneName() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function BookingForm({ eventType }: { eventType: PublicEventType }) {
  const bookingRequest = useRef<{ slot: string; id: string } | null>(null)
  const [windowIndex, setWindowIndex] = useState(0)
  const range = useMemo(() => {
    const start = addDays(startOfDay(new Date()), windowIndex * 14)
    return { start, end: addDays(start, 14) }
  }, [windowIndex])
  const [slots, setSlots] = useState<PublicScheduleSlot[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<PublicScheduleSlot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBooking, setIsBooking] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null)

  useEffect(() => {
    let cancelled = false
    scheduleApi
      .fetchPublicSlots(eventType.slug, range.start, range.end)
      .then((available) => {
        if (cancelled) return
        setSlots(available)
        setSelectedDay(
          available[0] ? format(available[0].start, "yyyy-MM-dd") : null
        )
        setSlotsError(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setSlotsError(
          error instanceof Error ? error.message : "Failed to load times"
        )
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [eventType.slug, range])

  const days = useMemo(() => {
    const unique = new Map<string, Date>()
    for (const slot of slots) {
      const key = format(slot.start, "yyyy-MM-dd")
      if (!unique.has(key)) unique.set(key, slot.start)
    }
    return [...unique.entries()]
  }, [slots])

  const daySlots = selectedDay
    ? slots.filter((slot) => format(slot.start, "yyyy-MM-dd") === selectedDay)
    : []
  const canGoForward = (windowIndex + 1) * 14 < eventType.bookingWindowDays

  const changeWindow = (nextIndex: number) => {
    setIsLoading(true)
    setSlots([])
    setSlotsError(null)
    setBookingError(null)
    setSelectedDay(null)
    setSelectedSlot(null)
    setWindowIndex(nextIndex)
  }

  const handleBook = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedSlot || isBooking) return

    const form = new FormData(event.currentTarget)
    // Reuse the same request id while the user retries the same slot, so a
    // retry after a network error can't create a duplicate booking.
    const slotKey = selectedSlot.start.toISOString()
    if (bookingRequest.current?.slot !== slotKey) {
      bookingRequest.current = { slot: slotKey, id: crypto.randomUUID() }
    }

    setIsBooking(true)
    setBookingError(null)
    scheduleApi
      .bookPublicSlot(eventType.slug, {
        start: selectedSlot.start,
        guestName: String(form.get("guestName") ?? ""),
        guestEmail: String(form.get("guestEmail") ?? ""),
        guestNotes: String(form.get("guestNotes") ?? "") || undefined,
        requestId: bookingRequest.current.id,
      })
      .then(setConfirmed)
      .catch((error: unknown) => {
        setBookingError(
          error instanceof Error ? error.message : "Failed to book this time"
        )
      })
      .finally(() => setIsBooking(false))
  }

  if (confirmed) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
        <span className="mb-5 grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CalendarCheckIcon className="size-6" />
        </span>
        <h2 className="font-heading text-xl font-semibold">You&apos;re booked</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {format(confirmed.start, "EEEE, MMMM d")} at{" "}
          {format(confirmed.start, "h:mm a")}–{format(confirmed.end, "h:mm a")}
        </p>
        {eventType.location && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <VideoIcon className="size-3.5" />
            {eventType.location}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{timeZoneName()}</p>
      </div>
    )
  }

  return (
    <div className="grid min-h-[520px] lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 border-b border-border/70 p-5 lg:border-r lg:border-b-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ClockIcon className="size-4 text-muted-foreground" />
            Select a time
          </div>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Earlier dates"
              disabled={windowIndex === 0}
              onClick={() => changeWindow(windowIndex - 1)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ChevronLeftIcon />
            </Button>
            <span className="min-w-28 text-center text-xs text-muted-foreground">
              {format(range.start, "MMM d")}–{format(addDays(range.end, -1), "MMM d")}
            </span>
            <Button
              aria-label="Later dates"
              disabled={!canGoForward}
              onClick={() => changeWindow(windowIndex + 1)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid h-64 place-items-center text-sm text-muted-foreground">
            Finding open times…
          </div>
        ) : slotsError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {slotsError}
          </div>
        ) : days.length === 0 ? (
          <div className="grid h-64 place-items-center text-center text-sm text-muted-foreground">
            No open times in the next two weeks.
          </div>
        ) : (
          <>
            <div className="flex gap-1 overflow-x-auto pb-3">
              {days.map(([key, date]) => (
                <button
                  className={cn(
                    "flex min-w-14 shrink-0 flex-col items-center rounded-md border px-2 py-2 text-xs transition-colors",
                    selectedDay === key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted"
                  )}
                  key={key}
                  onClick={() => {
                    setSelectedDay(key)
                    setSelectedSlot(null)
                    setBookingError(null)
                  }}
                  type="button"
                >
                  <span className="font-medium">{format(date, "EEE")}</span>
                  <span className="mt-1 text-base font-semibold">{format(date, "d")}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {daySlots.map((slot) => {
                const selected = selectedSlot?.start.getTime() === slot.start.getTime()
                return (
                  <button
                    className={cn(
                      "h-10 rounded-md border text-sm font-medium tabular-nums transition-colors",
                      selected
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-border hover:border-foreground hover:bg-muted"
                    )}
                    key={slot.start.toISOString()}
                    onClick={() => {
                      setSelectedSlot(slot)
                      setBookingError(null)
                    }}
                    type="button"
                  >
                    {format(slot.start, "h:mm a")}
                  </button>
                )
              })}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{timeZoneName()}</p>
          </>
        )}
      </div>

      {selectedSlot ? (
        <form
          className="flex flex-col p-5"
          onSubmit={handleBook}
        >
        <h3 className="text-sm font-semibold">Your details</h3>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="guest-name">Name</Label>
            <Input id="guest-name" name="guestName" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-email">Email</Label>
            <Input id="guest-email" name="guestEmail" required type="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-notes">Notes</Label>
            <Textarea id="guest-notes" name="guestNotes" rows={4} />
          </div>
        </div>

        <div className="mt-5 border-y border-border/70 py-3 text-sm">
          <p className="font-medium">{format(selectedSlot.start, "EEE, MMM d")}</p>
          <p className="text-muted-foreground">
            {format(selectedSlot.start, "h:mm a")}–{format(selectedSlot.end, "h:mm a")}
          </p>
          {eventType.location && (
            <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <VideoIcon className="size-3.5" />
              {eventType.location}
            </p>
          )}
        </div>

        {bookingError && (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {bookingError}
          </p>
        )}

        <Button
          className="mt-auto w-full"
          disabled={!selectedSlot || isBooking}
          size="lg"
          type="submit"
        >
          {isBooking ? "Booking…" : "Confirm booking"}
        </Button>
        </form>
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center border-t border-border/70 px-8 text-center lg:border-t-0">
          <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
            <CalendarClockIcon className="size-5" />
          </span>
          <p className="mt-3 text-sm font-medium">Choose an open time</p>
          <p className="mt-1 max-w-48 text-xs leading-relaxed text-muted-foreground">
            Your booking details will appear here.
          </p>
        </div>
      )}
    </div>
  )
}
