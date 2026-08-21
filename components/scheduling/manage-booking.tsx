"use client"

import { format } from "date-fns"
import {
  CalendarCheckIcon,
  CalendarXIcon,
  ClockIcon,
  MapPinIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import type { PublicManagedBooking } from "@/components/scheduling/types"
import { Button, buttonVariants } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cancelPublicBooking } from "@/lib/api/schedule"
import { cn } from "@/lib/utils"

export function ManageBooking({
  initialBooking,
  managementToken,
}: {
  initialBooking: PublicManagedBooking
  managementToken: string
}) {
  const [booking, setBooking] = useState(initialBooking)
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState("")
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancel = async () => {
    setCancelling(true)
    setError(null)
    try {
      const result = await cancelPublicBooking(
        booking.bookingUid,
        managementToken,
        reason.trim() || undefined
      )
      setBooking((current) => ({
        ...current,
        status: result.status,
        canCancel: false,
        canReschedule: false,
      }))
      setConfirming(false)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to cancel this booking"
      )
    } finally {
      setCancelling(false)
    }
  }

  const cancelled = booking.status === "cancelled"

  return (
    <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div>
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg",
              cancelled
                ? "bg-destructive/10 text-destructive"
                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            )}
          >
            {cancelled ? (
              <CalendarXIcon className="size-5" />
            ) : (
              <CalendarCheckIcon className="size-5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {cancelled
                ? "Cancelled"
                : booking.status === "pending"
                  ? "Awaiting confirmation"
                  : "Confirmed"}
            </p>
            <h1 className="mt-1 font-heading text-2xl font-semibold">
              {booking.title}
            </h1>
            {booking.description && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {booking.description}
              </p>
            )}
          </div>
        </div>

        <dl className="mt-7 grid gap-4 border-y border-border/70 py-5 sm:grid-cols-2">
          <div className="flex gap-2.5">
            <ClockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">Date and time</dt>
              <dd className="mt-0.5 text-sm font-medium">
                {format(booking.start, "EEEE, MMMM d")}
              </dd>
              <dd className="text-sm text-muted-foreground">
                {format(booking.start, "h:mm a")}–{format(booking.end, "h:mm a")}
              </dd>
              <dd className="mt-0.5 text-xs text-muted-foreground">
                {booking.timezone}
              </dd>
            </div>
          </div>
          {booking.location && (
            <div className="flex gap-2.5">
              <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Location</dt>
                <dd className="mt-0.5 text-sm font-medium">{booking.location}</dd>
              </div>
            </div>
          )}
        </dl>

        <p className="mt-4 text-sm text-muted-foreground">
          Booked for <span className="font-medium text-foreground">{booking.guestName}</span>
          {" · "}
          {booking.guestEmail}
        </p>
      </div>

      <aside className="border-t border-border/70 pt-6 lg:border-t-0 lg:border-l lg:pl-7 lg:pt-0">
        {cancelled ? (
          <div>
            <p className="text-sm font-medium">This booking was cancelled.</p>
            {booking.eventTypeSlug && (
              <Link
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "mt-4 w-full"
                )}
                href={`/schedule/${booking.eventTypeSlug}`}
              >
                Book another time
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
          {booking.canReschedule && booking.eventTypeSlug && (
            <Link
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full"
              )}
              href={`/schedule/${booking.eventTypeSlug}?reschedule=${booking.bookingUid}&token=${encodeURIComponent(managementToken)}`}
            >
              <ClockIcon />
              Choose a new time
            </Link>
          )}
          {booking.canCancel && (confirming ? (
            <div>
              <p className="text-sm font-medium">Cancel this booking?</p>
              <Textarea
                className="mt-3 min-h-24"
                maxLength={1000}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason (optional)"
                value={reason}
              />
              {error && (
                <p className="mt-3 text-sm text-destructive">{error}</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  className="flex-1"
                  disabled={cancelling}
                  onClick={() => void cancel()}
                  variant="destructive"
                >
                  {cancelling ? "Cancelling…" : "Confirm"}
                </Button>
                <Button
                  disabled={cancelling}
                  onClick={() => setConfirming(false)}
                  variant="outline"
                >
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={() => setConfirming(true)}
              variant="outline"
            >
              <CalendarXIcon />
              Cancel booking
            </Button>
          ))}
          {!booking.canCancel && !booking.canReschedule && (
            <p className="text-sm text-muted-foreground">
              This booking can no longer be changed online.
            </p>
          )}
          </div>
        )}
      </aside>
    </div>
  )
}