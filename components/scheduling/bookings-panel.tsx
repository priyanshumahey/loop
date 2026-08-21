"use client"

import { format } from "date-fns"
import {
  CalendarCheckIcon,
  CalendarXIcon,
  CheckIcon,
  ClockIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { useState } from "react"

import type { SchedulingBooking } from "@/components/scheduling/types"
import { Button } from "@/components/ui/button"
import { useSchedulingBookings } from "@/hooks/use-scheduling-bookings"
import { cn } from "@/lib/utils"

const STATUS_STYLE: Record<
  SchedulingBooking["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
  },
  rejected: {
    label: "Rejected",
    className: "bg-muted text-muted-foreground",
  },
  rescheduled: {
    label: "Rescheduled",
    className: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
}

function BookingCard({
  booking,
  busy,
  onAction,
}: {
  booking: SchedulingBooking
  busy: boolean
  onAction: (
    action: "confirm" | "reject" | "cancel"
  ) => Promise<boolean>
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const status = STATUS_STYLE[booking.status]

  return (
    <article className="rounded-lg border border-border/70 bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold">{booking.title}</h3>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {booking.guestName} · {booking.guestEmail}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            status.className
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-2.5 flex items-start gap-2 text-[11px] text-muted-foreground">
        <ClockIcon className="mt-0.5 size-3 shrink-0" />
        <span>
          {format(booking.start, "EEE, MMM d · h:mm a")}–
          {format(booking.end, "h:mm a")}
        </span>
      </div>

      {booking.guestNotes && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {booking.guestNotes}
        </p>
      )}

      {booking.providerSyncStatus === "failed" && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/5 px-2 py-1.5 text-[10px] text-destructive">
          <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" />
          <span className="line-clamp-2">
            Calendar sync will retry
            {booking.providerSyncError ? `: ${booking.providerSyncError}` : "."}
          </span>
        </div>
      )}

      {booking.status === "pending" && (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Button
            disabled={busy}
            onClick={() => void onAction("confirm")}
            size="sm"
          >
            <CheckIcon /> Approve
          </Button>
          <Button
            disabled={busy}
            onClick={() => void onAction("reject")}
            size="sm"
            variant="outline"
          >
            <XIcon /> Reject
          </Button>
        </div>
      )}

      {booking.status === "confirmed" && (
        <div className="mt-3">
          {confirmingCancel ? (
            <div className="flex gap-1.5">
              <Button
                className="flex-1"
                disabled={busy}
                onClick={async () => {
                  if (await onAction("cancel")) setConfirmingCancel(false)
                }}
                size="sm"
                variant="destructive"
              >
                Confirm cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() => setConfirmingCancel(false)}
                size="sm"
                variant="outline"
              >
                Back
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => setConfirmingCancel(true)}
              size="sm"
              variant="ghost"
            >
              <CalendarXIcon /> Cancel booking
            </Button>
          )}
        </div>
      )}
    </article>
  )
}

export function BookingsPanel({
  bookingsState,
}: {
  bookingsState: ReturnType<typeof useSchedulingBookings>
}) {
  const {
    bookings,
    isLoading,
    isRefreshing,
    actionId,
    error,
    refresh,
    act,
  } = bookingsState

  if (isLoading) {
    return (
      <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
        Loading bookings…
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <span className="text-[11px] text-muted-foreground">
          {bookings.length} upcoming
        </span>
        <Button
          aria-label="Refresh bookings"
          disabled={isRefreshing}
          onClick={() => void refresh()}
          size="icon-xs"
          variant="ghost"
        >
          <RefreshCwIcon className={cn(isRefreshing && "animate-spin")} />
        </Button>
      </div>

      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="grid size-10 place-items-center rounded-xl border border-border/70 bg-muted/40 text-muted-foreground">
            <CalendarCheckIcon className="size-5" />
          </span>
          <p className="mt-3 text-sm font-medium">No upcoming bookings</p>
          <p className="mt-1 text-xs text-muted-foreground">
            New requests and confirmed meetings appear here.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {bookings.map((booking) => (
            <BookingCard
              booking={booking}
              busy={actionId === booking.id}
              key={booking.id}
              onAction={(action) => act(booking.id, action)}
            />
          ))}
        </div>
      )}
    </div>
  )
}