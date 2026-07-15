"use client"

import { format, isSameDay } from "date-fns"
import {
  CalendarCheckIcon,
  CalendarXIcon,
  ChevronRightIcon,
  MapPinIcon,
} from "lucide-react"

import { ConnectGoogle } from "@/components/cal/agent/connect-google"
import type {
  AgentEvent,
  AvailabilityCheck as AvailabilityData,
} from "@/lib/cal-agent/tools"

function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const day = format(start, "EEEE, MMM d")
  const from = format(start, "h:mm a")
  const to = format(end, "h:mm a")
  return isSameDay(start, end)
    ? `${day} · ${from} – ${to}`
    : `${day}, ${from} → ${format(end, "EEEE, MMM d")}, ${to}`
}

export function AvailabilityCheck({
  result,
  onOpenEvent,
}: {
  result: AvailabilityData
  onOpenEvent?: (event: AgentEvent) => void
}) {
  if (result.error) {
    return (
      <div className="my-2 text-[12px] text-destructive">
        Couldn&apos;t check that time: {result.error}
      </div>
    )
  }

  if (!result.connected && result.conflicts.length === 0) {
    return (
      <ConnectGoogle description="Connect Google Calendar to verify this time against your full schedule." />
    )
  }

  if (!result.verified && result.conflicts.length === 0) {
    return (
      <div className="my-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-3">
        <div className="text-[13px] font-medium text-foreground">
          Couldn&apos;t refresh Google Calendar
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          I can&apos;t verify that this time is free yet. Please try again.
        </p>
      </div>
    )
  }

  const conflictCount = result.conflicts.length
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/70 bg-background">
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        {result.available ? (
          <CalendarCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <CalendarXIcon className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
        )}
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground">
            {result.available
              ? "This time is available"
              : `${conflictCount} ${conflictCount === 1 ? "conflict" : "conflicts"}`}
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">
            {formatWindow(result.start, result.end)}
          </div>
        </div>
      </div>

      {conflictCount > 0 && (
        <div className="border-t border-border/60">
          {result.conflicts.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onOpenEvent?.(event)}
              className="group flex w-full items-center gap-2 border-b border-border/50 px-3.5 py-2 text-left last:border-b-0 hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                {event.title}
              </span>
              {event.location && (
                <MapPinIcon className="size-3 shrink-0 text-muted-foreground/70" />
              )}
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {event.allDay
                  ? "All day"
                  : format(new Date(event.start), "h:mm a")}
              </span>
              <ChevronRightIcon className="size-3.5 shrink-0 text-transparent group-hover:text-muted-foreground/60" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
