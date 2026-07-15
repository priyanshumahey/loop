import { RRule, type Options, type Weekday } from "rrule"

import type { EventRecurrence } from "@/components/event-calendar/types"

const FREQUENCIES: Record<EventRecurrence["frequency"], number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
}

const WEEKDAYS: Weekday[] = [
  RRule.SU,
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
]

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  }
}

export function zonedToUtc(
  wallTime: {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
  },
  timeZone: string
): Date {
  const target = Date.UTC(
    wallTime.year,
    wallTime.month - 1,
    wallTime.day,
    wallTime.hour,
    wallTime.minute,
    wallTime.second
  )
  let instant = target

  for (let attempt = 0; attempt < 4; attempt++) {
    const actual = zonedParts(new Date(instant), timeZone)
    const actualWallTime = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    )
    const correction = target - actualWallTime
    instant += correction
    if (correction === 0) break
  }

  return new Date(instant)
}

export function dateInTimeZone(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone)
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`
}

export function calendarDateToUtc(date: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error("Calendar date must use YYYY-MM-DD")
  const [, year, month, day] = match
  return zonedToUtc(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone
  )
}

export function addCalendarDays(date: string, amount: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error("Calendar date must use YYYY-MM-DD")
  const [, year, month, day] = match
  const shifted = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day) + amount)
  )
  return shifted.toISOString().slice(0, 10)
}

export function isFirstRecurrenceOccurrence(
  seriesStartIso: string,
  boundaryStartIso: string,
  options: { allDay: boolean; timeZone: string }
): boolean {
  if (options.allDay) {
    const seriesDate = dateInTimeZone(new Date(seriesStartIso), options.timeZone)
    const boundaryDate = /^\d{4}-\d{2}-\d{2}$/.test(boundaryStartIso)
      ? boundaryStartIso
      : dateInTimeZone(new Date(boundaryStartIso), options.timeZone)
    return seriesDate === boundaryDate
  }

  return new Date(seriesStartIso).getTime() === new Date(boundaryStartIso).getTime()
}

export function shiftByWallTimeChange(
  value: Date,
  before: Date,
  after: Date,
  timeZone: string
): Date {
  const wallClockValue = zonedParts(value, timeZone)
  const beforeParts = zonedParts(before, timeZone)
  const afterParts = zonedParts(after, timeZone)
  const wallClock = (parts: ReturnType<typeof zonedParts>) =>
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    )
  const shifted = new Date(
    wallClock(wallClockValue) + wallClock(afterParts) - wallClock(beforeParts)
  )

  return zonedToUtc(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
    },
    timeZone
  )
}

function recurrenceUntil(
  date: string,
  allDay: boolean,
  timeZone: string
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error("Recurrence end date must use YYYY-MM-DD")

  const [, year, month, day] = match
  return zonedToUtc(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: allDay ? 0 : 23,
      minute: allDay ? 0 : 59,
      second: allDay ? 0 : 59,
    },
    timeZone
  )
}

export function recurrenceToGoogleRule(
  recurrence: EventRecurrence,
  options: { allDay: boolean; timeZone: string }
): string {
  const interval = recurrence.interval ?? 1
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) {
    throw new Error("Recurrence interval must be between 1 and 99")
  }

  const ruleOptions: Partial<Options> = {
    freq: FREQUENCIES[recurrence.frequency],
    interval,
  }

  if (recurrence.byWeekday?.length) {
    const days = [...new Set(recurrence.byWeekday)].sort(
      (left, right) => left - right
    )
    if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error("Recurrence weekdays must be between Sunday and Saturday")
    }
    ruleOptions.byweekday = days.map((day) => WEEKDAYS[day])
  }

  const ends = recurrence.ends ?? "never"
  if (ends === "on") {
    if (!recurrence.until) throw new Error("Recurrence end date is required")
    ruleOptions.until = recurrenceUntil(
      recurrence.until,
      options.allDay,
      options.timeZone
    )
  } else if (ends === "after") {
    if (!Number.isInteger(recurrence.count) || (recurrence.count ?? 0) < 1) {
      throw new Error("Recurrence count must be at least 1")
    }
    ruleOptions.count = recurrence.count
  }

  let rule = new RRule(ruleOptions).toString()
  if (options.allDay && recurrence.until) {
    rule = rule.replace(
      /;UNTIL=\d{8}(?:T\d{6}Z)?/i,
      `;UNTIL=${recurrence.until.replaceAll("-", "")}`
    )
  }
  return rule
}

/**
 * Trim a Google recurrence (list of RRULE/EXRULE/RDATE/EXDATE lines) so the
 * series ends immediately before `boundaryStartIso` — the scheduled start of
 * the first occurrence that should no longer belong to it. Used to split a
 * series for "this and following" edits and deletions: the original series is
 * trimmed here, and a fresh series is created from the boundary onward.
 *
 * Only the RRULE line is trimmed; any COUNT is dropped in favour of an explicit
 * UNTIL so the cut lands on the right occurrence regardless of prior count.
 */
export function trimRecurrenceRules(
  rules: string[],
  boundaryStartIso: string,
  allDay: boolean
): string[] {
  const boundaryMs = new Date(boundaryStartIso).getTime()
  if (Number.isNaN(boundaryMs)) {
    throw new Error("Recurrence split boundary is not a valid date")
  }

  return rules.map((line) => {
    if (!line.toUpperCase().startsWith("RRULE")) return line

    const ruleOptions = RRule.parseString(line.replace(/^RRULE:/i, ""))
    ruleOptions.count = null

    if (allDay) {
      // All-day UNTIL must be a bare DATE (no time) one day before the cut.
      const untilYmd = addCalendarDays(
        boundaryStartIso.slice(0, 10),
        -1
      ).replaceAll("-", "")
      ruleOptions.until = new Date(boundaryMs - 24 * 60 * 60 * 1000)
      return new RRule(ruleOptions)
        .toString()
        .replace(/;UNTIL=\d{8}(T\d{6}Z)?/i, `;UNTIL=${untilYmd}`)
    }

    // Timed UNTIL is one second before the boundary occurrence, in UTC.
    ruleOptions.until = new Date(boundaryMs - 1000)
    return new RRule(ruleOptions).toString()
  })
}

function recurrenceWallTime(
  value: string,
  timeZone: string,
  allDay: boolean
): Date {
  if (allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00Z`)
  }
  const parts = zonedParts(new Date(value), timeZone)
  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    )
  )
}

/** Adjust COUNT so a replacement series contains only the remaining tail. */
export function recurrenceRulesForTail(
  rules: string[],
  seriesStartIso: string,
  boundaryStartIso: string,
  options: { allDay: boolean; timeZone: string }
): string[] {
  const seriesStart = recurrenceWallTime(
    seriesStartIso,
    options.timeZone,
    options.allDay
  )
  const boundary = recurrenceWallTime(
    boundaryStartIso,
    options.timeZone,
    options.allDay
  )

  return rules.map((line) => {
    if (!line.toUpperCase().startsWith("RRULE")) return line
    const ruleOptions = RRule.parseString(line.replace(/^RRULE:/i, ""))
    if (!ruleOptions.count) return line

    const occurrencesBefore = new RRule({
      ...ruleOptions,
      dtstart: seriesStart,
    })
      .between(seriesStart, boundary, true)
      .filter((occurrence) => occurrence.getTime() < boundary.getTime()).length
    const remaining = ruleOptions.count - occurrencesBefore
    if (remaining < 1) {
      throw new Error("Recurrence split boundary is outside the counted series")
    }

    return line.replace(/(?:^|;)COUNT=\d+(?=;|$)/i, (countPart) =>
      countPart.replace(/COUNT=\d+/i, `COUNT=${remaining}`)
    )
  })
}

const FREQUENCY_FROM_RRULE: Record<number, EventRecurrence["frequency"]> = {
  [RRule.DAILY]: "daily",
  [RRule.WEEKLY]: "weekly",
  [RRule.MONTHLY]: "monthly",
  [RRule.YEARLY]: "yearly",
}

/**
 * Parse a Google recurrence (list of RRULE/EXRULE/RDATE/EXDATE lines) back into
 * loop's `EventRecurrence`, reading only the RRULE line. Returns null when there
 * is no usable RRULE. `timeZone` resolves an UNTIL instant to a calendar date.
 */
export function googleRuleToRecurrence(
  rules: string[] | null | undefined,
  timeZone: string
): EventRecurrence | null {
  const line = rules?.find((rule) => rule.toUpperCase().startsWith("RRULE"))
  if (!line) return null

  const options = RRule.parseString(line.replace(/^RRULE:/i, ""))
  if (options.freq == null) return null
  const frequency = FREQUENCY_FROM_RRULE[options.freq]
  if (!frequency) return null

  const parts = line
    .replace(/^RRULE:/i, "")
    .split(";")
    .map((part) => part.split("=", 1)[0]?.toUpperCase())
  const supportedParts = new Set(["FREQ", "INTERVAL", "BYDAY", "COUNT", "UNTIL"])
  const byDay = /(?:^|;)BYDAY=([^;]+)/i.exec(line)?.[1]?.split(",") ?? []
  const weekdayPreset =
    byDay.length === 5 &&
    ["MO", "TU", "WE", "TH", "FR"].every((day) =>
      byDay.some((candidate) => candidate.toUpperCase() === day)
    )
  const hasUnsupportedShape =
    rules?.some((rule) => !rule.toUpperCase().startsWith("RRULE")) ||
    parts.some((part) => !supportedParts.has(part)) ||
    byDay.some((day) => !/^(MO|TU|WE|TH|FR|SA|SU)$/i.test(day)) ||
    (options.byweekday != null && frequency !== "weekly") ||
    (frequency === "weekly" && byDay.length > 1 && !weekdayPreset) ||
    options.wkst != null

  const recurrence: EventRecurrence = { frequency }
  if (hasUnsupportedShape) recurrence.readOnly = true
  if (options.interval && options.interval > 1) recurrence.interval = options.interval

  if (options.byweekday != null) {
    const weekdays = Array.isArray(options.byweekday)
      ? options.byweekday
      : [options.byweekday]
    // rrule numbers weekdays Monday=0..Sunday=6; entries may be numbers,
    // Weekday objects, or two-letter codes. loop uses Sunday=0..Saturday=6.
    const RRULE_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
    const days = weekdays
      .map((day) => {
        if (typeof day === "number") return day
        if (typeof day === "string") return RRULE_CODES.indexOf(day)
        return day.weekday
      })
      .filter((rruleDay) => rruleDay >= 0)
      .map((rruleDay) => (rruleDay + 1) % 7)
      .sort((left, right) => left - right)
    if (days.length > 0) recurrence.byWeekday = days
  }

  if (options.until) {
    recurrence.ends = "on"
    const dateOnlyUntil = /(?:^|;)UNTIL=(\d{4})(\d{2})(\d{2})(?:;|$)/i.exec(line)
    recurrence.until = dateOnlyUntil
      ? `${dateOnlyUntil[1]}-${dateOnlyUntil[2]}-${dateOnlyUntil[3]}`
      : dateInTimeZone(options.until, timeZone)
  } else if (options.count) {
    recurrence.ends = "after"
    recurrence.count = options.count
  } else {
    recurrence.ends = "never"
  }

  return recurrence
}
