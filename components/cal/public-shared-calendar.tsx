"use client"

import {
  addDays,
  addMonths,
  addWeeks,
  areIntervalsOverlapping,
  differenceInMinutes,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  max,
  min,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { Tooltip as TooltipPrimitive } from "radix-ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import type {
  CalendarShareView,
  PublicCalendarShare,
} from "@/lib/db/calendar-shares"
import { cn } from "@/lib/utils"

interface SharedEvent {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  color: string | null
}

interface SerializedSharedEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  color: string | null
}

const EVENT_COLOR: Record<string, string> = {
  sky: "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  amber: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  violet: "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100",
  rose: "border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100",
  emerald: "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  orange: "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100",
}

const DEFAULT_HOUR_HEIGHT = 56
const MIN_HOUR_HEIGHT = 36
const MAX_HOUR_HEIGHT = 96
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

interface PositionedEvent {
  event: SharedEvent
  top: number
  height: number
  lane: number
  laneCount: number
}

function shareDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function rangeFor(
  view: CalendarShareView,
  date: Date,
  minimum: Date,
  maximum: Date
) {
  let start: Date
  let end: Date
  if (view === "week") {
    start = startOfWeek(date)
    end = addDays(endOfWeek(date), 1)
  } else if (view === "month") {
    start = startOfWeek(startOfMonth(date))
    end = addDays(endOfWeek(endOfMonth(date)), 1)
  } else {
    start = startOfDay(date)
    end = addDays(start, 30)
  }
  return {
    start: max([start, minimum]),
    end: min([end, addDays(maximum, 1)]),
  }
}

function isVisibleDay(day: Date, share: PublicCalendarShare) {
  const key = format(day, "yyyy-MM-dd")
  return (
    key >= share.startDate &&
    key <= share.endDate &&
    share.visibleWeekdays.includes(day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6)
  )
}

function eventsForDay(events: SharedEvent[], day: Date) {
  const start = startOfDay(day)
  const end = addDays(start, 1)
  return events.filter((event) => event.start < end && event.end > start)
}

function eventTime(event: SharedEvent) {
  if (event.allDay) return "All day"
  if (isSameDay(event.start, event.end)) {
    return `${format(event.start, "p")} – ${format(event.end, "p")}`
  }
  return `${format(event.start, "MMM d, p")} – ${format(event.end, "MMM d, p")}`
}

function EventTooltip({
  event,
  children,
}: {
  event: SharedEvent
  children: React.ReactElement
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            className="z-50 max-w-72 rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg"
            sideOffset={6}
          >
            <p className="text-sm font-semibold leading-snug">{event.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{eventTime(event)}</p>
            <TooltipPrimitive.Arrow className="fill-popover" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

function EventBlock({ event, compact = false }: { event: SharedEvent; compact?: boolean }) {
  return (
    <EventTooltip event={event}>
      <div
        className={cn(
          "min-w-0 rounded-md border px-2 py-1.5",
          EVENT_COLOR[event.color ?? ""] ??
            "border-border bg-muted text-foreground"
        )}
        tabIndex={0}
      >
        <p className="truncate text-xs font-semibold">{event.title}</p>
        {!compact && (
          <p className="mt-0.5 truncate text-[11px] opacity-70">{eventTime(event)}</p>
        )}
      </div>
    </EventTooltip>
  )
}

function WeekView({
  date,
  events,
  share,
}: {
  date: Date
  events: SharedEvent[]
  share: PublicCalendarShare
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrolledRangeRef = useRef("")
  const hourHeightRef = useRef(DEFAULT_HOUR_HEIGHT)
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT)
  const days = eachDayOfInterval({
    start: startOfWeek(date),
    end: endOfWeek(date),
  }).filter((day) => isVisibleDay(day, share))

  const allDayByDay = useMemo(
    () =>
      days.map((day) =>
        eventsForDay(events, day).filter((event) => event.allDay)
      ),
    [days, events]
  )

  const positionedByDay = useMemo(
    () =>
      days.map((day) => {
        const dayStart = startOfDay(day)
        const dayEnd = addDays(dayStart, 1)
        const timed = eventsForDay(events, day)
          .filter((event) => !event.allDay)
          .map((event) => ({
            event,
            start: max([event.start, dayStart]),
            end: min([event.end, dayEnd]),
          }))
          .sort((left, right) => {
            const startDifference = left.start.getTime() - right.start.getTime()
            return startDifference || right.end.getTime() - left.end.getTime()
          })

        const lanes: { start: Date; end: Date }[][] = []
        const assigned = timed.map((item) => {
          let lane = lanes.findIndex((entries) =>
            entries.every(
              (entry) =>
                !areIntervalsOverlapping(
                  { start: item.start, end: item.end },
                  entry,
                  { inclusive: false }
                )
            )
          )
          if (lane === -1) {
            lane = lanes.length
            lanes.push([])
          }
          lanes[lane].push({ start: item.start, end: item.end })
          return { ...item, lane }
        })
        const laneCount = Math.max(lanes.length, 1)

        return assigned.map(({ event, start, end, lane }): PositionedEvent => {
          const minutesFromMidnight = differenceInMinutes(start, dayStart)
          const durationMinutes = Math.max(differenceInMinutes(end, start), 15)
          return {
            event,
            top: (minutesFromMidnight / 60) * hourHeight,
            height: Math.max((durationMinutes / 60) * hourHeight, 22),
            lane,
            laneCount,
          }
        })
      }),
    [days, events, hourHeight]
  )

  useEffect(() => {
    const rangeKey = days.map((day) => day.toISOString()).join(":")
    if (autoScrolledRangeRef.current === rangeKey) return
    autoScrolledRangeRef.current = rangeKey

    const earliestHour = positionedByDay
      .flat()
      .reduce(
        (earliest, positioned) =>
          Math.min(earliest, Math.floor(positioned.top / hourHeight)),
        9
      )
    const container = scrollRef.current
    if (!container) return

    const todayIndex = days.findIndex((day) => isToday(day))
    const dayWidth = (container.scrollWidth - 56) / days.length
    const centeredToday =
      todayIndex < 0
        ? 0
        : 56 + todayIndex * dayWidth - (container.clientWidth - dayWidth) / 2

    container.scrollTo({
      left: Math.max(centeredToday, 0),
      top: Math.max(earliestHour - 1, 0) * hourHeight - 48,
    })
  }, [days, positionedByDay, hourHeight])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()

      const currentHeight = hourHeightRef.current
      const bounds = container.getBoundingClientRect()
      const cursorY = event.clientY - bounds.top
      const contentY = container.scrollTop + cursorY
      const nextHeight = Math.min(
        MAX_HOUR_HEIGHT,
        Math.max(
          MIN_HOUR_HEIGHT,
          currentHeight + (event.deltaY < 0 ? 8 : -8)
        )
      )
      if (nextHeight === currentHeight) return

      const nextScrollTop = (contentY / currentHeight) * nextHeight - cursorY
      hourHeightRef.current = nextHeight
      setHourHeight(nextHeight)
      requestAnimationFrame(() => {
        container.scrollTop = Math.max(nextScrollTop, 0)
      })
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [])

  if (days.length === 0) {
    return <p className="p-12 text-center text-sm text-muted-foreground">No visible days in this week.</p>
  }

  const hasAllDayEvents = allDayByDay.some((eventsForDate) => eventsForDate.length > 0)
  const gridTemplateColumns = `3.5rem repeat(${days.length}, minmax(112px, 1fr))`

  return (
    <div
      className="max-h-[calc(100svh-18rem)] min-h-[28rem] overflow-auto overscroll-contain sm:max-h-[min(72svh,760px)]"
      ref={scrollRef}
    >
      <div className="min-w-[720px]">
        <div
          className="sticky top-0 z-30 grid border-b border-border/70 bg-background"
          style={{ gridTemplateColumns }}
        >
          <div className="sticky left-0 z-10 border-r border-border/70 bg-background" />
          {days.map((day) => (
            <div
              className={cn(
                "border-r border-border/70 py-2 text-center text-xs text-muted-foreground last:border-r-0",
                isToday(day) && "font-semibold text-sky-600 dark:text-sky-400"
              )}
              key={day.toISOString()}
            >
              {format(day, "EEE")} {" "}
              <span
                className={cn(
                  "inline-grid size-6 place-items-center rounded-full",
                  isToday(day) && "bg-sky-500 text-white"
                )}
              >
                {format(day, "d")}
              </span>
            </div>
          ))}
        </div>

        {hasAllDayEvents && (
          <div
            className="sticky top-[41px] z-20 grid border-b border-border/70 bg-muted/50"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-10 flex items-end justify-end border-r border-border/70 bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              All day
            </div>
            {days.map((day, dayIndex) => (
              <div
                className="min-h-8 space-y-1 border-r border-border/70 p-1 last:border-r-0"
                key={day.toISOString()}
              >
                {allDayByDay[dayIndex].map((event) => (
                  <EventBlock compact event={event} key={event.id} />
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="grid" style={{ gridTemplateColumns }}>
          <div className="sticky left-0 z-20 border-r border-border/70 bg-background">
            {HOURS.map((hour) => (
              <div
                className="relative border-b border-border/70"
                key={hour}
                style={{ height: hourHeight }}
              >
                {hour > 0 && (
                  <span className="absolute -top-2.5 right-2 bg-background px-1 text-[11px] tabular-nums text-muted-foreground">
                    {format(new Date(2026, 0, 1, hour), "h a")}
                  </span>
                )}
              </div>
            ))}
          </div>

          {days.map((day, dayIndex) => (
            <div
              className={cn(
                "relative border-r border-border/70 last:border-r-0",
                isToday(day) && "bg-sky-500/[0.035]"
              )}
              key={day.toISOString()}
              style={{ height: HOURS.length * hourHeight }}
            >
              {HOURS.map((hour) => (
                <div
                  className="border-b border-border/70 after:absolute after:left-0 after:right-0 after:top-1/2 after:border-t after:border-dashed after:border-border/40"
                  key={hour}
                  style={{ height: hourHeight }}
                />
              ))}

              {positionedByDay[dayIndex].map((positioned) => (
                <EventTooltip event={positioned.event} key={`${positioned.event.id}-${positioned.top}`}>
                  <div
                    className="absolute z-10 px-0.5 outline-none"
                    style={{
                      top: positioned.top,
                      height: positioned.height,
                      left: `${(positioned.lane / positioned.laneCount) * 100}%`,
                      width: `${100 / positioned.laneCount}%`,
                    }}
                    tabIndex={0}
                  >
                    <div
                      className={cn(
                        "h-full overflow-hidden rounded-md border px-1.5 py-1 shadow-sm",
                        EVENT_COLOR[positioned.event.color ?? ""] ??
                          "border-border bg-muted text-foreground"
                      )}
                    >
                      <p className="truncate text-[11px] font-semibold leading-tight">
                        {positioned.event.title}
                      </p>
                      {positioned.height >= 34 && (
                        <p className="mt-0.5 truncate text-[10px] leading-tight opacity-70">
                          {format(positioned.event.start, "h:mm a")}
                        </p>
                      )}
                    </div>
                  </div>
                </EventTooltip>
              ))}

              {isToday(day) && (() => {
                const now = new Date()
                const top =
                  ((now.getHours() * 60 + now.getMinutes()) / 60) * hourHeight
                return (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
                    style={{ top }}
                  >
                    <span className="-ml-1 size-2 rounded-full bg-rose-500" />
                    <span className="h-px flex-1 bg-rose-500" />
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MonthView({
  date,
  events,
  share,
}: {
  date: Date
  events: SharedEvent[]
  share: PublicCalendarShare
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(date)),
    end: endOfWeek(endOfMonth(date)),
  }).filter((day) => isVisibleDay(day, share))
  const weekdays = eachDayOfInterval({
    start: startOfWeek(date),
    end: endOfWeek(date),
  }).filter((day) => share.visibleWeekdays.includes(day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6))
  if (days.length === 0) {
    return <p className="p-12 text-center text-sm text-muted-foreground">No visible days in this month.</p>
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div
          className="grid border-b border-border/70 bg-muted/30"
          style={{ gridTemplateColumns: `repeat(${weekdays.length}, minmax(108px, 1fr))` }}
        >
          {weekdays.map((day) => (
              <div className="px-2 py-2 text-xs font-medium text-muted-foreground" key={day.toISOString()}>
                {format(day, "EEE")}
              </div>
            ))}
        </div>
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${weekdays.length}, minmax(108px, 1fr))` }}
        >
          {days.map((day) => (
            <section
              className={cn(
                "min-h-28 border-b border-r border-border/70 p-1.5",
                !isSameMonth(day, date) && "bg-muted/20 text-muted-foreground"
              )}
              key={day.toISOString()}
            >
              <span
                className={cn(
                  "mb-1 grid size-6 place-items-center rounded-full text-xs font-medium",
                  isToday(day) && "bg-foreground text-background"
                )}
              >
                {format(day, "d")}
              </span>
              <div className="space-y-1">
                {eventsForDay(events, day)
                  .slice(0, 3)
                  .map((event) => (
                    <EventBlock compact event={event} key={`${day.toISOString()}-${event.id}`} />
                  ))}
                {eventsForDay(events, day).length > 3 && (
                  <p className="px-1 text-[11px] text-muted-foreground">
                    +{eventsForDay(events, day).length - 3} more
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function AgendaView({
  date,
  events,
  share,
}: {
  date: Date
  events: SharedEvent[]
  share: PublicCalendarShare
}) {
  const days = eachDayOfInterval({
    start: max([startOfDay(date), shareDate(share.startDate)]),
    end: min([addDays(date, 29), shareDate(share.endDate)]),
  }).filter((day) => isVisibleDay(day, share))
  const populated = days.filter((day) => eventsForDay(events, day).length > 0)
  if (populated.length === 0) {
    return <p className="p-12 text-center text-sm text-muted-foreground">No events in this range.</p>
  }
  return (
    <div className="divide-y divide-border/70">
      {populated.map((day) => (
        <section className="grid gap-3 p-4 sm:grid-cols-[8rem_1fr]" key={day.toISOString()}>
          <div>
            <p className="text-sm font-semibold">{format(day, "EEEE")}</p>
            <p className="text-xs text-muted-foreground">{format(day, "MMMM d")}</p>
          </div>
          <div className="space-y-2">
            {eventsForDay(events, day).map((event) => (
              <EventBlock event={event} key={`${day.toISOString()}-${event.id}`} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function PublicSharedCalendar({
  token,
  share,
}: {
  token: string
  share: PublicCalendarShare
}) {
  const minimum = useMemo(() => shareDate(share.startDate), [share.startDate])
  const maximum = useMemo(() => shareDate(share.endDate), [share.endDate])
  const [currentDate, setCurrentDate] = useState(() =>
    min([max([new Date(), shareDate(share.startDate)]), shareDate(share.endDate)])
  )
  const [events, setEvents] = useState<SharedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const range = useMemo(
    () => rangeFor(share.view, currentDate, minimum, maximum),
    [share.view, currentDate, minimum, maximum]
  )

  const fetchEvents = useCallback(
    () =>
      fetch(
        `/api/calendar-shares/public/${token}?start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`,
        { cache: "no-store" }
      ).then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Could not load calendar")
        return (body.data as SerializedSharedEvent[]).map((event) => ({
          ...event,
          start: new Date(event.start),
          end: new Date(event.end),
        }))
      }),
    [range, token]
  )

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      fetchEvents()
        .then((nextEvents) => {
          if (!cancelled) {
            setEvents(nextEvents)
            setError(null)
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setError(reason instanceof Error ? reason.message : "Could not load calendar")
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [fetchEvents])

  const move = (direction: -1 | 1) => {
    setLoading(true)
    setCurrentDate((date) => {
      const next =
        share.view === "month"
          ? direction < 0
            ? subMonths(date, 1)
            : addMonths(date, 1)
          : direction < 0
            ? subWeeks(date, 1)
            : addWeeks(date, 1)
      return min([max([next, minimum]), maximum])
    })
  }

  const previousDisabled = currentDate <= minimum
  const nextDisabled = currentDate >= maximum
  const today = new Date()
  const todayDisabled = today < minimum || today > addDays(maximum, 1)
  const visibleRangeDays = eachDayOfInterval({
    start: range.start,
    end: addDays(range.end, -1),
  }).filter((day) => isVisibleDay(day, share))
  const visibleRangeStart = visibleRangeDays.at(0) ?? range.start
  const visibleRangeEnd = visibleRangeDays.at(-1) ?? addDays(range.end, -1)

  const title =
    share.view === "month"
      ? format(currentDate, "MMMM yyyy")
      : share.view === "week"
        ? `${format(visibleRangeStart, "MMM d")} – ${format(visibleRangeEnd, "MMM d, yyyy")}`
        : `${format(visibleRangeStart, "MMM d")} – ${format(visibleRangeEnd, "MMM d, yyyy")}`

  return (
    <section
      aria-busy={loading}
      className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-xl shadow-foreground/5"
    >
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-border/70 px-3 py-3 sm:px-4">
        <div className="flex items-center gap-1">
          <Button aria-label="Previous date range" disabled={previousDisabled} onClick={() => move(-1)} size="icon-sm" variant="ghost">
            <ChevronLeftIcon />
          </Button>
          <Button aria-label="Next date range" disabled={nextDisabled} onClick={() => move(1)} size="icon-sm" variant="ghost">
            <ChevronRightIcon />
          </Button>
          <Button
            onClick={() => {
              setLoading(true)
              setCurrentDate(new Date())
            }}
            disabled={todayDisabled}
            size="sm"
            variant="outline"
          >
            Today
          </Button>
        </div>
        <h2 className="truncate text-right font-heading text-sm font-semibold sm:text-lg">{title}</h2>
      </header>
      {error && (
        <p className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {share.view === "week" && <WeekView date={currentDate} events={events} share={share} />}
      {share.view === "month" && <MonthView date={currentDate} events={events} share={share} />}
      {share.view === "agenda" && <AgendaView date={currentDate} events={events} share={share} />}
    </section>
  )
}