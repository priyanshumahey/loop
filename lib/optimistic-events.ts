import { RRule } from "rrule"

import type {
  CalendarEvent,
  RecurrenceScope,
} from "@/components/event-calendar/types"
import {
  calendarDateToUtc,
  recurrenceToGoogleRule,
  shiftByWallTimeChange,
} from "@/lib/recurrence"

function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime()
  }
  if (typeof left === "object" || typeof right === "object") {
    return JSON.stringify(left) === JSON.stringify(right)
  }
  return left === right
}

function occurrenceAtOrAfter(
  event: CalendarEvent,
  boundary: CalendarEvent,
  timeZone: string
): boolean {
  const eventOriginal = event.originalStart
  const boundaryOriginal = boundary.originalStart
  if (
    eventOriginal &&
    boundaryOriginal &&
    /^\d{4}-\d{2}-\d{2}$/.test(eventOriginal) &&
    /^\d{4}-\d{2}-\d{2}$/.test(boundaryOriginal)
  ) {
    return eventOriginal >= boundaryOriginal
  }

  const instant = (value: string | undefined, fallback: Date) =>
    value
      ? /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? calendarDateToUtc(value, timeZone)
        : new Date(value)
      : fallback
  return (
    instant(eventOriginal, event.start).getTime() >=
    instant(boundaryOriginal, boundary.start).getTime()
  )
}

function scheduledStart(event: CalendarEvent, timeZone: string): Date {
  if (!event.originalStart) return event.start
  return /^\d{4}-\d{2}-\d{2}$/.test(event.originalStart)
    ? calendarDateToUtc(event.originalStart, timeZone)
    : new Date(event.originalStart)
}

export function applyOptimisticEventUpdate(
  events: CalendarEvent[],
  updated: CalendarEvent,
  recurrenceScope: RecurrenceScope
): CalendarEvent[] {
  const selected = events.find((event) => event.id === updated.id)
  if (!selected || recurrenceScope === "single" || !selected.recurringEventId) {
    return events.map((event) => (event.id === updated.id ? updated : event))
  }

  const timeZone = updated.timezone ?? selected.timezone ?? "UTC"
  const scalarKeys = [
    "title",
    "description",
    "allDay",
    "color",
    "location",
    "timezone",
    "recurrence",
  ] as const
  const changedScalarKeys = scalarKeys.filter(
    (key) => !sameValue(selected[key], updated[key])
  )
  const startChanged = !sameValue(selected.start, updated.start)
  const endChanged = !sameValue(selected.end, updated.end)
  const selectedScheduledStart = scheduledStart(selected, timeZone)

  return events.map((event) => {
    const inSeries = event.recurringEventId === selected.recurringEventId
    const inScope =
      inSeries &&
      (recurrenceScope === "series" ||
        occurrenceAtOrAfter(event, selected, timeZone))
    if (!inScope) return event

    const next: CalendarEvent = { ...event }
    for (const key of changedScalarKeys) {
      Object.assign(next, { [key]: updated[key] })
    }

    let nextStart = event.start
    if (startChanged) {
      nextStart = shiftByWallTimeChange(
        scheduledStart(event, timeZone),
        selectedScheduledStart,
        updated.start,
        timeZone
      )
      next.start = nextStart
    }

    if (endChanged) {
      const desiredDuration = updated.end.getTime() - updated.start.getTime()
      next.end = new Date(nextStart.getTime() + desiredDuration)
    } else if (startChanged) {
      const currentDuration = event.end.getTime() - event.start.getTime()
      next.end = new Date(nextStart.getTime() + currentDuration)
    }

    return next
  })
}

const MAX_OPTIMISTIC_OCCURRENCES = 750

/** A Date's wall-clock components reinterpreted as a naive UTC instant. */
function toNaiveUtc(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds()
    )
  )
}

/** Inverse of `toNaiveUtc`: naive UTC components back to a local Date. */
function fromNaiveUtc(date: Date): Date {
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  )
}

/**
 * Expand a just-created recurring event into the occurrences visible in a
 * window so the whole series renders immediately, before Google's real
 * instances are pulled in. Occurrences carry temporary ids and a shared
 * temporary `recurringEventId`; a subsequent sync replaces them with the
 * authoritative Google instances.
 */
export function expandRecurrenceOccurrences(
  event: CalendarEvent,
  windowStart: Date,
  windowEnd: Date
): CalendarEvent[] {
  if (!event.recurrence) return [event]

  let occurrences: Date[]
  try {
    const rule = recurrenceToGoogleRule(event.recurrence, {
      allDay: event.allDay ?? false,
      timeZone: event.timezone ?? "UTC",
    })
    const options = RRule.parseString(rule.replace(/^RRULE:/i, ""))
    const rrule = new RRule({ ...options, dtstart: toNaiveUtc(event.start) })
    occurrences = rrule
      .between(toNaiveUtc(windowStart), toNaiveUtc(windowEnd), true)
      .slice(0, MAX_OPTIMISTIC_OCCURRENCES)
  } catch {
    return [event]
  }

  if (occurrences.length === 0) return [event]

  const duration = event.end.getTime() - event.start.getTime()
  const seriesId = `temp-series-${event.start.getTime()}`
  return occurrences.map((occurrence, index) => {
    const start = fromNaiveUtc(occurrence)
    return {
      ...event,
      id: `${seriesId}-${index}`,
      start,
      end: new Date(start.getTime() + duration),
      recurringEventId: seriesId,
      originalStart: start.toISOString(),
    }
  })
}