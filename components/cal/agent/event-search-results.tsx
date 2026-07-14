"use client"

import { format, isSameDay } from "date-fns"
import { CalendarSearchIcon, ChevronRightIcon, MapPinIcon } from "lucide-react"

import { ConnectGoogle } from "@/components/cal/agent/connect-google"
import type { AgentEvent } from "@/lib/cal-agent/tools"
import { cn } from "@/lib/utils"

const COLOR_DOT: Record<string, string> = {
  sky: "bg-sky-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
  rose: "bg-rose-400",
  emerald: "bg-emerald-400",
  orange: "bg-orange-400",
}

/** Human-readable time range for an event card. */
function formatRange(event: AgentEvent): string {
  const start = new Date(event.start)
  const end = new Date(event.end)
  if (event.allDay) return `${format(start, "EEE MMM d")} · All day`
  const day = format(start, "EEE MMM d")
  const from = format(start, "h:mm a")
  const to = format(end, "h:mm a")
  if (isSameDay(start, end)) return `${day} · ${from} – ${to}`
  return `${day}, ${from} → ${format(end, "EEE MMM d")}, ${to}`
}

function EventCard({
  event,
  onOpen,
}: {
  event: AgentEvent
  onOpen?: (event: AgentEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(event)}
      className="group flex w-full items-start gap-2.5 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <span
        className={cn(
          "mt-1 size-2.5 shrink-0 rounded-full",
          COLOR_DOT[event.color ?? "sky"] ?? COLOR_DOT.sky
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">
          {event.title}
        </div>
        <div className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
          {formatRange(event)}
        </div>
        {event.location && (
          <div className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground/80">
            <MapPinIcon className="size-3 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}
      </div>
      <ChevronRightIcon className="mt-1 size-4 shrink-0 text-transparent transition-colors group-hover:text-muted-foreground/60" />
    </button>
  )
}

/**
 * Generative-UI block rendered when the `searchEvents` tool returns. Shows the
 * matched events as interactive cards.
 */
export function EventSearchResults({
  query,
  events,
  count,
  connected = true,
  error,
  onOpenEvent,
}: {
  query: string
  events: AgentEvent[]
  count: number
  connected?: boolean
  error?: string
  onOpenEvent?: (event: AgentEvent) => void
}) {
  // Explain an empty/errored result caused by Google not being connected.
  if (!connected && events.length === 0) return <ConnectGoogle />

  return (
    <div className="my-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <CalendarSearchIcon className="size-3.5" />
        {error ? (
          <span className="text-destructive">Search failed: {error}</span>
        ) : (
          <span>
            {count} {count === 1 ? "result" : "results"}
            {query ? (
              <>
                {" "}for <span className="font-medium text-foreground">“{query}”</span>
              </>
            ) : null}
          </span>
        )}
      </div>

      {!error && events.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {events.map((event) => (
            <EventCard key={event.id} event={event} onOpen={onOpenEvent} />
          ))}
        </div>
      )}

      {!error && events.length === 0 && (
        <p className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-[12px] text-muted-foreground">
          No matching events found.
        </p>
      )}
    </div>
  )
}
