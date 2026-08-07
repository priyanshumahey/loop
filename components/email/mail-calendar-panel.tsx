'use client'

import {
  addDays,
  addHours,
  areIntervalsOverlapping,
  differenceInMinutes,
  eachHourOfInterval,
  endOfDay,
  format,
  getHours,
  getMinutes,
  isSameDay,
  isToday,
  startOfDay,
} from 'date-fns'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PanelRightCloseIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { EndHour, StartHour } from '@/components/event-calendar/constants'
import { useCurrentTimeIndicator } from '@/components/event-calendar/hooks/use-current-time-indicator'
import type { CalendarEvent } from '@/components/event-calendar/types'
import {
  getEventColorClasses,
  isMultiDayEvent,
} from '@/components/event-calendar/utils'
import { useEvents } from '@/hooks/use-events'
import { cn } from '@/lib/utils'

/** Pixel height of one hour row in the mini day grid. */
const CELL_HEIGHT = 48
const GRID_HEIGHT = (EndHour - StartHour) * CELL_HEIGHT

interface PositionedEvent {
  event: CalendarEvent
  top: number
  height: number
  left: number
  width: number
  zIndex: number
}

function eventTimeLabel(event: CalendarEvent): string {
  const start = format(new Date(event.start), 'h:mm')
  const end = format(new Date(event.end), 'h:mm a')
  return `${start} – ${end}`
}

/** Lay out a day's timed events into overlap columns (ported from DayView). */
function positionEvents(day: Date, events: CalendarEvent[]): PositionedEvent[] {
  const dayStart = startOfDay(day)
  const timeEvents = events
    .filter((e) => {
      if (e.allDay || isMultiDayEvent(e)) return false
      const s = new Date(e.start)
      const en = new Date(e.end)
      return isSameDay(day, s) || isSameDay(day, en) || (day > s && day < en)
    })
    .sort((a, b) => {
      const aStart = new Date(a.start).getTime()
      const bStart = new Date(b.start).getTime()
      if (aStart !== bStart) return aStart - bStart
      const aDur = differenceInMinutes(new Date(a.end), new Date(a.start))
      const bDur = differenceInMinutes(new Date(b.end), new Date(b.start))
      return bDur - aDur
    })

  const result: PositionedEvent[] = []
  const columns: { event: CalendarEvent; end: Date }[][] = []

  for (const event of timeEvents) {
    const eventStart = new Date(event.start)
    const eventEnd = new Date(event.end)
    const adjustedStart = isSameDay(day, eventStart) ? eventStart : dayStart
    const adjustedEnd = isSameDay(day, eventEnd)
      ? eventEnd
      : addHours(dayStart, 24)

    const startHour = getHours(adjustedStart) + getMinutes(adjustedStart) / 60
    const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60
    const top = (startHour - StartHour) * CELL_HEIGHT
    const height = Math.max((endHour - startHour) * CELL_HEIGHT, 18)

    let columnIndex = 0
    let placed = false
    while (!placed) {
      const col = columns[columnIndex] || []
      if (col.length === 0) {
        columns[columnIndex] = col
        placed = true
      } else {
        const overlaps = col.some((c) =>
          areIntervalsOverlapping(
            { end: adjustedEnd, start: adjustedStart },
            { end: new Date(c.event.end), start: new Date(c.event.start) }
          )
        )
        if (!overlaps) placed = true
        else columnIndex++
      }
    }

    const currentColumn = columns[columnIndex] || []
    columns[columnIndex] = currentColumn
    currentColumn.push({ end: adjustedEnd, event })

    const width = columnIndex === 0 ? 1 : 0.9
    const left = columnIndex === 0 ? 0 : columnIndex * 0.1
    result.push({ event, height, left, top, width, zIndex: 10 + columnIndex })
  }

  return result
}

/**
 * A compact, read-only day view for the mail page's right rail — a scrollable
 * time grid with hour gridlines, positioned events, an all-day row, and a live
 * current-time indicator, mirroring the calendar page's day view. Navigate day
 * by day with the arrows; click an event to open it in the full calendar.
 */
export function MailCalendarPanel({
  headerLeading,
  onClose,
}: {
  headerLeading?: React.ReactNode
  onClose?: () => void
}) {
  const router = useRouter()
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()))
  const scrollRef = useRef<HTMLDivElement>(null)

  const startDate = useMemo(() => startOfDay(day), [day])
  const endDate = useMemo(() => endOfDay(day), [day])
  const { events, isLoading, isConnected } = useEvents({ startDate, endDate })

  const hours = useMemo(
    () =>
      eachHourOfInterval({
        start: addHours(startOfDay(day), StartHour),
        end: addHours(startOfDay(day), EndHour - 1),
      }),
    [day]
  )

  const dayEvents = useMemo(
    () =>
      events.filter((e) => {
        const s = new Date(e.start)
        const en = new Date(e.end)
        return isSameDay(day, s) || isSameDay(day, en) || (day > s && day < en)
      }),
    [day, events]
  )
  const allDayEvents = useMemo(
    () => dayEvents.filter((e) => e.allDay || isMultiDayEvent(e)),
    [dayEvents]
  )
  const positioned = useMemo(() => positionEvents(day, events), [day, events])

  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    day,
    'day'
  )

  // Scroll to the current time (or 8am for other days) when the day changes.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const now = new Date()
    const hour = isToday(day) ? Math.max(now.getHours() - 1, 0) : 8
    container.scrollTop = hour * CELL_HEIGHT
  }, [day])

  const openEvent = (event: CalendarEvent) => {
    const params = new URLSearchParams({
      event: event.id,
      date: new Date(event.start).toISOString(),
    })
    router.push(`/cal?${params.toString()}`)
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div className="flex min-w-0 items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Collapse panel"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PanelRightCloseIcon className="size-4" />
            </button>
          )}
          {headerLeading}
        </div>
        <button
          type="button"
          onClick={() => setDay(startOfDay(new Date()))}
          className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Today
        </button>
      </header>

      {/* Day navigator */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={() => setDay((d) => startOfDay(addDays(d, -1)))}
          aria-label="Previous day"
          className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <div className="min-w-0 text-center">
          <div
            className={cn(
              'truncate text-[13px] font-medium',
              isToday(day) ? 'text-primary' : 'text-foreground'
            )}
          >
            {isToday(day) ? 'Today' : format(day, 'EEEE')}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {format(day, 'MMMM d, yyyy')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDay((d) => startOfDay(addDays(d, 1)))}
          aria-label="Next day"
          className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      {!isConnected && !isLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[13px] text-muted-foreground">
            Connect Google Calendar to see your schedule.
          </p>
          <a
            href="/auth/google"
            className="inline-flex items-center rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90"
          >
            Connect Google
          </a>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-none"
        >
          {/* All-day row */}
          {allDayEvents.length > 0 && (
            <div className="sticky top-0 z-30 grid grid-cols-[3rem_1fr] border-b border-border/60 bg-background">
              <span className="flex items-center justify-end py-1 pe-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                All day
              </span>
              <div className="flex flex-col gap-1 border-l border-border/60 p-1">
                {allDayEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => openEvent(event)}
                    className={cn(
                      'truncate rounded px-2 py-1 text-left text-[12px] font-medium',
                      getEventColorClasses(event.color)
                    )}
                  >
                    {event.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Time grid */}
          <div className="grid grid-cols-[3rem_1fr]">
            {/* Hour labels */}
            <div>
              {hours.map((hour, index) => (
                <div
                  key={hour.toString()}
                  className="relative border-b border-border/50"
                  style={{ height: CELL_HEIGHT }}
                >
                  {index > 0 && (
                    <span className="absolute -top-2.5 right-0 flex h-5 items-center justify-end pe-2 text-[10px] text-muted-foreground">
                      {format(hour, 'h a')}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Events column */}
            <div
              className={cn(
                'relative border-l border-border/60',
                isToday(day) && 'bg-sky-50/40 dark:bg-sky-900/10'
              )}
              style={{ height: GRID_HEIGHT }}
            >
              {/* Hour gridlines */}
              {hours.map((hour) => (
                <div
                  key={hour.toString()}
                  className="border-b border-border/50"
                  style={{ height: CELL_HEIGHT }}
                />
              ))}

              {/* Current-time indicator */}
              {currentTimeVisible && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-40 flex items-center"
                  style={{
                    top: `${(currentTimePosition / 100) * GRID_HEIGHT}px`,
                  }}
                >
                  <div className="size-2 shrink-0 -translate-x-1/2 rounded-full bg-rose-500" />
                  <div className="h-px flex-1 bg-rose-500" />
                </div>
              )}

              {/* Positioned events */}
              {positioned.map((pe) => (
                <button
                  key={pe.event.id}
                  type="button"
                  onClick={() => openEvent(pe.event)}
                  className={cn(
                    'absolute overflow-hidden rounded px-1.5 py-0.5 text-left shadow-sm transition-colors',
                    getEventColorClasses(pe.event.color)
                  )}
                  style={{
                    top: pe.top,
                    height: pe.height,
                    left: `${pe.left * 100}%`,
                    width: `calc(${pe.width * 100}% - 4px)`,
                    zIndex: pe.zIndex,
                  }}
                >
                  <div className="truncate text-[11px] font-medium leading-tight">
                    {pe.event.title}
                  </div>
                  {pe.height > 30 && (
                    <div className="truncate text-[10px] opacity-80">
                      {eventTimeLabel(pe.event)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
