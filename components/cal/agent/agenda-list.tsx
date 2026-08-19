"use client"

import { format, isSameDay } from "date-fns"
import { CalendarIcon, ChevronRightIcon, MapPinIcon } from "lucide-react"

import { ConnectGoogle } from "@/components/cal/agent/connect-google"
import { AgentCard, AgentNotice } from "@/components/agent"
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

function timeLabel(event: AgentEvent): string {
  if (event.allDay) return "All day"
  return format(new Date(event.start), "h:mm a")
}

/** Group events into day buckets for the agenda. */
function groupByDay(events: AgentEvent[]): { day: Date; items: AgentEvent[] }[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  )
  const groups: { day: Date; items: AgentEvent[] }[] = []
  for (const event of sorted) {
    const day = new Date(event.start)
    const last = groups.at(-1)
    if (last && isSameDay(last.day, day)) last.items.push(event)
    else groups.push({ day, items: [event] })
  }
  return groups
}

/** Generative-UI block for the `listEvents` tool: a day-grouped agenda. */
export function AgendaList({
  events,
  connected = true,
  error,
  onOpenEvent,
}: {
  events: AgentEvent[]
  connected?: boolean
  error?: string
  onOpenEvent?: (event: AgentEvent) => void
}) {
  if (!connected && events.length === 0) return <ConnectGoogle />
  if (error) {
    return (
      <AgentNotice
        icon={<CalendarIcon className="size-3.5" />}
        title="Couldn’t load events"
        description={error}
        tone="danger"
      />
    )
  }
  if (events.length === 0) {
    return (
      <AgentNotice
        icon={<CalendarIcon className="size-3.5" />}
        title="Nothing scheduled"
        description="There are no events in that range."
      />
    )
  }

  const groups = groupByDay(events)

  return (
    <AgentCard
      title="Agenda"
      icon={<CalendarIcon className="size-3.5" />}
      meta={`${events.length} ${events.length === 1 ? "event" : "events"}`}
      bodyClassName="flex flex-col gap-0 p-0"
    >
      {groups.map((group) => (
        <div key={group.day.toISOString()} className="flex flex-col">
          <div className="border-b border-line bg-inset px-3 py-1.5 text-[11px] font-medium text-ink-3">
            {format(group.day, "EEEE, MMM d")}
          </div>
          <div className="flex flex-col">
            {group.items.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onOpenEvent?.(event)}
                className="group flex min-h-10 w-full items-center gap-2.5 border-b border-line px-3 text-left transition-colors last:border-b-0 hover:bg-hover"
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    COLOR_DOT[event.color ?? "sky"] ?? COLOR_DOT.sky
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                  {event.title}
                </span>
                {event.location && (
                  <MapPinIcon className="size-3 shrink-0 text-muted-foreground/70" />
                )}
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {timeLabel(event)}
                </span>
                <ChevronRightIcon className="size-3.5 shrink-0 text-transparent transition-colors group-hover:text-muted-foreground/60" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </AgentCard>
  )
}
