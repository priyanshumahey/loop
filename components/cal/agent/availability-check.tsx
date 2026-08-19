"use client"

import { format, isSameDay } from "date-fns"
import {
  CalendarCheckIcon,
  CalendarXIcon,
  ChevronRightIcon,
  MapPinIcon,
} from "lucide-react"

import { ConnectGoogle } from "@/components/cal/agent/connect-google"
import { AgentCard, AgentNotice } from "@/components/agent"
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
      <AgentNotice
        icon={<CalendarXIcon className="size-3.5" />}
        title="Couldn’t check that time"
        description={result.error}
        tone="danger"
      />
    )
  }

  if (!result.connected && result.conflicts.length === 0) {
    return (
      <ConnectGoogle description="Connect Google Calendar to verify this time against your full schedule." />
    )
  }

  if (!result.verified && result.conflicts.length === 0) {
    return (
      <AgentCard
        title="Couldn’t refresh Google Calendar"
        icon={<CalendarXIcon className="size-3.5" />}
        tone="warning"
      >
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          I can&apos;t verify that this time is free yet. Please try again.
        </p>
      </AgentCard>
    )
  }

  const conflictCount = result.conflicts.length
  return (
    <AgentCard
      title={
        result.available
          ? "This time is available"
          : `${conflictCount} ${conflictCount === 1 ? "conflict" : "conflicts"}`
      }
      icon={
        result.available ? (
          <CalendarCheckIcon className="size-3.5 text-green" />
        ) : (
          <CalendarXIcon className="size-3.5 text-red" />
        )
      }
      tone={result.available ? "success" : "danger"}
      bodyClassName={conflictCount > 0 ? "pb-0" : undefined}
    >
      <div className="text-[12px] tabular-nums text-muted-foreground">
        {formatWindow(result.start, result.end)}
      </div>
      {conflictCount > 0 && (
        <div className="mt-3 -mx-3 overflow-hidden border-t border-line bg-inset">
          {result.conflicts.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onOpenEvent?.(event)}
              className="group flex min-h-9 w-full items-center gap-2 border-b border-line px-3 text-left transition-colors last:border-b-0 hover:bg-hover"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
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
    </AgentCard>
  )
}
