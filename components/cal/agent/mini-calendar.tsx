"use client"

import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { ConnectGoogle } from "@/components/cal/agent/connect-google"
import type { CalendarEvent } from "@/components/event-calendar/types"
import { syncEvents } from "@/lib/api/events"
import type { AgentEvent, CalendarView } from "@/lib/cal-agent/tools"
import { cn } from "@/lib/utils"

/** Solid dot color per event color, for month/summary markers. */
const COLOR_DOT: Record<string, string> = {
  sky: "bg-sky-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
  rose: "bg-rose-400",
  emerald: "bg-emerald-400",
  orange: "bg-orange-400",
}

/** Chip styling (fill + text) per event color, for day/week blocks. */
const COLOR_CHIP: Record<string, string> = {
  sky: "bg-sky-100 text-sky-900 dark:bg-sky-500/25 dark:text-sky-100",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100",
  violet:
    "bg-violet-100 text-violet-900 dark:bg-violet-500/25 dark:text-violet-100",
  rose: "bg-rose-100 text-rose-900 dark:bg-rose-500/25 dark:text-rose-100",
  emerald:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100",
  orange:
    "bg-orange-100 text-orange-900 dark:bg-orange-500/25 dark:text-orange-100",
}

const dot = (color?: string | null) => COLOR_DOT[color ?? "sky"] ?? COLOR_DOT.sky
const chip = (color?: string | null) =>
  COLOR_CHIP[color ?? "sky"] ?? COLOR_CHIP.sky

const startMs = (e: AgentEvent) => new Date(e.start).getTime()
const endMs = (e: AgentEvent) => new Date(e.end).getTime()

/** Map a live CalendarEvent (Date objects) to the compact AgentEvent shape. */
function toAgentEvent(e: CalendarEvent): AgentEvent {
  return {
    id: e.id,
    title: e.title || "(no title)",
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    allDay: e.allDay ?? false,
    location: e.location ?? null,
    description: e.description ?? null,
    color: e.color ?? null,
  }
}

/**
 * Generative-UI block for the `showCalendar` tool. Renders the events in a
 * compact day / week / month layout the model picks — a "mini calendar" the
 * user can glance at inline in the chat.
 *
 * The events captured when the tool ran are shown instantly, then the component
 * re-syncs live events for the same range on mount (and on manual refresh), so a
 * page reload or a stale conversation always reflects the current calendar.
 */
export function MiniCalendar({
  view,
  rangeStart,
  rangeEnd,
  events,
  connected = true,
  error,
  onOpenEvent,
}: {
  view: CalendarView
  rangeStart: string
  rangeEnd: string
  events: AgentEvent[]
  connected?: boolean
  error?: string
  onOpenEvent?: (event: AgentEvent) => void
}) {
  // Live events fetched on mount; null until the first sync resolves, so we fall
  // back to the snapshot the tool persisted (instant render, no loading flash).
  const [live, setLive] = useState<AgentEvent[] | null>(null)
  const [liveConnected, setLiveConnected] = useState<boolean | null>(null)
  const [syncing, setSyncing] = useState(true)

  // Stable fetcher for the current range; setState happens only in the promise
  // callbacks below (never synchronously in an effect), matching the app's
  // mount-fetch pattern.
  const fetchRange = useCallback(
    () =>
      syncEvents({
        startDate: new Date(rangeStart),
        endDate: new Date(rangeEnd),
      }),
    [rangeStart, rangeEnd]
  )

  // Re-sync live data whenever this calendar mounts or its range changes. The
  // snapshot stays visible until fresh data arrives.
  useEffect(() => {
    let cancelled = false
    fetchRange()
      .then((res) => {
        if (cancelled) return
        setLive(res.events.map(toAgentEvent))
        setLiveConnected(res.connected)
      })
      .catch(() => {
        // Keep showing the snapshot if a live refresh fails.
      })
      .finally(() => {
        if (!cancelled) setSyncing(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchRange])

  const refresh = useCallback(() => {
    setSyncing(true)
    fetchRange()
      .then((res) => {
        setLive(res.events.map(toAgentEvent))
        setLiveConnected(res.connected)
      })
      .catch(() => {})
      .finally(() => setSyncing(false))
  }, [fetchRange])

  const shownEvents = live ?? events
  const shownConnected = liveConnected ?? connected

  if (!shownConnected && shownEvents.length === 0) return <ConnectGoogle />
  // Only surface the tool-time error before any live data has loaded.
  if (error && live === null) {
    return (
      <div className="my-2 text-[12px] text-destructive">
        Couldn&apos;t load your calendar: {error}
      </div>
    )
  }

  const anchor = new Date(rangeStart)

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/70 bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-[12px] font-medium text-foreground">
          {view === "day"
            ? format(anchor, "EEEE, MMMM d")
            : view === "week"
              ? `Week of ${format(startOfWeek(anchor), "MMM d")}`
              : format(anchor, "MMMM yyyy")}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {shownEvents.length} {shownEvents.length === 1 ? "event" : "events"}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={syncing}
            aria-label="Refresh calendar"
            title="Refresh"
            className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            <RefreshCwIcon className={cn("size-3", syncing && "animate-spin")} />
          </button>
        </div>
      </div>

      {view === "day" && (
        <DayView day={anchor} events={shownEvents} onOpenEvent={onOpenEvent} />
      )}
      {view === "week" && (
        <WeekView anchor={anchor} events={shownEvents} onOpenEvent={onOpenEvent} />
      )}
      {view === "month" && (
        <MonthView anchor={anchor} events={shownEvents} onOpenEvent={onOpenEvent} />
      )}
    </div>
  )
}

/* ------------------------------- Day view -------------------------------- */

const HOUR_PX = 40

/** Pack overlapping events into side-by-side lanes. */
function packLanes(events: AgentEvent[]): {
  placed: { event: AgentEvent; lane: number }[]
  laneCount: number
} {
  const sorted = [...events].sort((a, b) => startMs(a) - startMs(b))
  const laneEnds: number[] = []
  const placed = sorted.map((event) => {
    const s = startMs(event)
    let lane = laneEnds.findIndex((end) => end <= s)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(endMs(event))
    } else {
      laneEnds[lane] = endMs(event)
    }
    return { event, lane }
  })
  return { placed, laneCount: Math.max(1, laneEnds.length) }
}

function DayView({
  day,
  events,
  onOpenEvent,
}: {
  day: Date
  events: AgentEvent[]
  onOpenEvent?: (event: AgentEvent) => void
}) {
  const allDay = events.filter((e) => e.allDay)
  const timed = events.filter((e) => !e.allDay)

  if (timed.length === 0 && allDay.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
        Nothing scheduled.
      </p>
    )
  }

  // Fit the rail to the events (with an hour of padding), falling back to a
  // typical workday when there are no timed events.
  let minHour = 8
  let maxHour = 18
  if (timed.length > 0) {
    minHour = 24
    maxHour = 0
    for (const e of timed) {
      const s = new Date(e.start)
      const en = new Date(e.end)
      minHour = Math.min(minHour, s.getHours())
      const endH = en.getHours() + (en.getMinutes() > 0 ? 1 : 0)
      maxHour = Math.max(maxHour, endH)
    }
    minHour = Math.max(0, minHour - 1)
    maxHour = Math.min(24, Math.max(maxHour + 1, minHour + 4))
  }

  const hours = Array.from({ length: maxHour - minHour }, (_, i) => minHour + i)
  const railTop = startOfDay(day).getTime() + minHour * 60 * 60 * 1000
  const pxPerMs = HOUR_PX / (60 * 60 * 1000)
  const { placed, laneCount } = packLanes(timed)

  return (
    <div className="flex flex-col">
      {allDay.length > 0 && (
        <div className="flex flex-col gap-1 border-b border-border/50 px-3 py-2">
          {allDay.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onOpenEvent?.(e)}
              className={cn(
                "truncate rounded-md px-2 py-1 text-left text-[12px] font-medium",
                chip(e.color)
              )}
            >
              {e.title}
            </button>
          ))}
        </div>
      )}

      <div className="relative px-3 py-2">
        <div
          className="relative"
          style={{ height: hours.length * HOUR_PX }}
        >
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute inset-x-0 flex items-start"
              style={{ top: i * HOUR_PX }}
            >
              <span className="w-12 shrink-0 -translate-y-1.5 text-right text-[10px] tabular-nums text-muted-foreground/70">
                {format(new Date(0, 0, 0, h), "h a")}
              </span>
              <span className="mt-0 h-px flex-1 bg-border/50" />
            </div>
          ))}

          <div className="absolute inset-y-0 left-14 right-0">
            {placed.map(({ event, lane }) => {
              const top = Math.max(0, (startMs(event) - railTop) * pxPerMs)
              const height = Math.max(
                18,
                (endMs(event) - startMs(event)) * pxPerMs
              )
              const width = 100 / laneCount
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onOpenEvent?.(event)}
                  style={{
                    top,
                    height,
                    left: `${lane * width}%`,
                    width: `calc(${width}% - 3px)`,
                  }}
                  className={cn(
                    "absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight",
                    chip(event.color)
                  )}
                >
                  <span className="block truncate font-medium">
                    {event.title}
                  </span>
                  {height > 28 && (
                    <span className="block truncate opacity-80">
                      {format(new Date(event.start), "h:mm a")}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------- Week view ------------------------------- */

function WeekView({
  anchor,
  events,
  onOpenEvent,
}: {
  anchor: Date
  events: AgentEvent[]
  onOpenEvent?: (event: AgentEvent) => void
}) {
  const start = startOfWeek(anchor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const sorted = [...events].sort((a, b) => startMs(a) - startMs(b))

  return (
    <div className="grid grid-cols-7">
      {days.map((day, i) => {
        const dayEvents = sorted.filter((e) =>
          isSameDay(new Date(e.start), day)
        )
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "min-h-24 border-border/50 p-1",
              i < 6 && "border-r",
              isToday(day) && "bg-muted/40"
            )}
          >
            <div className="mb-1 flex items-baseline justify-center gap-1 py-0.5">
              <span className="text-[9px] font-medium uppercase text-muted-foreground">
                {format(day, "EEE")}
              </span>
              <span
                className={cn(
                  "text-[11px] font-semibold tabular-nums",
                  isToday(day)
                    ? "grid size-4 place-items-center rounded-full bg-foreground text-[10px] text-background"
                    : "text-foreground"
                )}
              >
                {format(day, "d")}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {dayEvents.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onOpenEvent?.(e)}
                  title={e.title}
                  className={cn(
                    "flex flex-col rounded px-1 py-0.5 text-left leading-tight",
                    chip(e.color)
                  )}
                >
                  {!e.allDay && (
                    <span className="text-[9px] tabular-nums opacity-80">
                      {format(new Date(e.start), "h:mm a")}
                    </span>
                  )}
                  <span className="truncate text-[10px] font-medium">
                    {e.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------ Month view ------------------------------- */

function MonthView({
  anchor,
  events,
  onOpenEvent,
}: {
  anchor: Date
  events: AgentEvent[]
  onOpenEvent?: (event: AgentEvent) => void
}) {
  const monthStart = startOfMonth(anchor)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = endOfWeek(endOfMonth(monthStart))
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const weekdayLabels = ["S", "M", "T", "W", "T", "F", "S"]

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border/50">
        {weekdayLabels.map((d, i) => (
          <div
            key={i}
            className="py-1 text-center text-[10px] font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayEvents = events.filter((e) =>
            isSameDay(new Date(e.start), day)
          )
          const inMonth = isSameMonth(day, monthStart)
          const first = dayEvents[0]
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={!first}
              onClick={() => first && onOpenEvent?.(first)}
              className={cn(
                "flex min-h-12 flex-col items-center gap-1 border-border/40 p-1 text-center",
                i % 7 !== 6 && "border-r",
                i < days.length - 7 && "border-b",
                first && "transition-colors hover:bg-muted/50",
                !inMonth && "opacity-40"
              )}
            >
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  isToday(day)
                    ? "grid size-5 place-items-center rounded-full bg-foreground font-semibold text-background"
                    : "text-foreground"
                )}
              >
                {format(day, "d")}
              </span>
              {dayEvents.length > 0 && (
                <span className="flex items-center gap-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className={cn("size-1.5 rounded-full", dot(e.color))}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[9px] text-muted-foreground">
                      +{dayEvents.length - 3}
                    </span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
