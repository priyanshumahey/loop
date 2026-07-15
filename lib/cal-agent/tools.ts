import {
  addDays,
  endOfDay,
  endOfWeek,
  format,
  setHours,
  startOfDay,
  startOfWeek,
} from "date-fns"
import { tool } from "ai"
import { z } from "zod"

import type {
  CalendarEvent,
  EventRecurrence,
  RecurrenceScope,
} from "@/components/event-calendar/types"
import {
  createEvent as dbCreateEvent,
  deleteEvent as dbDeleteEvent,
  getEventById as dbGetEventById,
  getEvents,
  updateEvent as dbUpdateEvent,
} from "@/lib/db/events"
import { isGoogleConnected, pullGoogleEvents } from "@/lib/google-sync"
import { createClient } from "@/lib/supabase/server"

const DAY_MS = 24 * 60 * 60 * 1000

/** A compact event shape returned to the model and rendered by the UI. */
export interface AgentEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  location: string | null
  description: string | null
  color: string | null
  recurringEventId: string | null
  originalStart: string | null
}

/** Per-day meeting-hours breakdown for the stats card. */
interface DayLoad {
  day: string
  hours: number
}

export interface CalendarStats {
  rangeStart: string
  rangeEnd: string
  totalEvents: number
  meetingCount: number
  totalHours: number
  busiestDay: DayLoad | null
  byDay: DayLoad[]
}

/** A free time slot suggested by findFreeSlots. */
export interface FreeSlot {
  start: string
  end: string
  durationMinutes: number
}

/** Result of checking whether one exact requested window is free. */
export interface AvailabilityCheck {
  start: string
  end: string
  available: boolean
  conflicts: AgentEvent[]
  connected: boolean
  verified: boolean
  error?: string
}

/** Which mini-calendar layout the UI should render. */
export type CalendarView = "day" | "week" | "month"

/** Payload for the `showCalendar` tool: events plus the view to render them in. */
export interface CalendarViewData {
  view: CalendarView
  rangeStart: string
  rangeEnd: string
  events: AgentEvent[]
  connected: boolean
  error?: string
}

/** Hours outside of which a slot counts as early-morning or late-night. */
const OFF_HOURS_EARLY = 8
const OFF_HOURS_LATE = 20

/** Whether a slot starts before 8am or ends after 8pm (local time). */
function isOffHours(startISO: string, endISO: string): boolean {
  const s = new Date(startISO)
  const e = new Date(endISO)
  const startMin = s.getHours() * 60 + s.getMinutes()
  let endMin = e.getHours() * 60 + e.getMinutes()
  if (endMin === 0) endMin = 24 * 60 // midnight boundary = end of day
  return startMin < OFF_HOURS_EARLY * 60 || endMin > OFF_HOURS_LATE * 60
}

/** Resolve whether the current user has Google connected (best-effort). */
async function checkGoogleConnected(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false
    return await isGoogleConnected(supabase, user.id)
  } catch {
    return false
  }
}

/** Refresh one calendar range from Google and distinguish absent auth from failure. */
async function syncGoogleRange(
  startDate: Date,
  endDate: Date
): Promise<{ connected: boolean; synced: boolean }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { connected: false, synced: false }
    const connected = await isGoogleConnected(supabase, user.id)
    if (!connected) return { connected: false, synced: false }
    const result = await pullGoogleEvents(
      supabase,
      user.id,
      startDate.toISOString(),
      endDate.toISOString()
    )
    return { connected: true, synced: result.synced }
  } catch (error) {
    console.error("Failed to refresh calendar range for agent:", error)
    return { connected: true, synced: false }
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Wall-clock date/time components of an instant, as seen in a timezone. */
function zonedParts(date: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value)
  return {
    year: g("year"),
    month: g("month"),
    day: g("day"),
    hour: g("hour") % 24,
    minute: g("minute"),
    second: g("second"),
  }
}

/**
 * The UTC instant corresponding to a wall-clock time in a given timezone, e.g.
 * "midnight on 2026-07-13 in America/Los_Angeles" → the correct UTC Date. Used
 * so day/week/month boundaries reflect the user's calendar day, not the server's.
 */
function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const parts = zonedParts(new Date(guess), timeZone)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  const offset = asUtc - guess // how far the tz wall-clock leads our UTC guess
  return new Date(guess - offset)
}

/** Local midnight (start of a calendar day) as a UTC instant, tz-aware. */
function localMidnight(
  year: number,
  month: number,
  day: number,
  timeZone?: string
): Date {
  if (timeZone) return zonedToUtc(year, month, day, 0, 0, timeZone)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

/** The calendar year/month/day of an anchor, resolved in the user's timezone. */
function anchorYMD(
  anchor: string | undefined,
  timeZone?: string
): { year: number; month: number; day: number } {
  // A plain YYYY-MM-DD is already a calendar date — take it verbatim.
  if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    const [year, month, day] = anchor.split("-").map(Number)
    return { year, month, day }
  }
  const base = anchor ? new Date(anchor) : new Date()
  if (timeZone) {
    const p = zonedParts(base, timeZone)
    return { year: p.year, month: p.month, day: p.day }
  }
  return {
    year: base.getFullYear(),
    month: base.getMonth() + 1,
    day: base.getDate(),
  }
}

/** Map a stored event to the compact shape the model + UI use. */
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
    recurringEventId: e.recurringEventId ?? null,
    originalStart: e.originalStart ?? null,
  }
}

/**
 * Search the user's calendar by keyword within a time window. Runs
 * server-side against the Supabase `events` table (auth resolved from the
 * request cookies), so it only ever sees the current user's events.
 */
const searchEvents = tool({
  description:
    "Search the user's calendar events by keyword. Matches the query against " +
    "event title, description, and location within an optional date range. " +
    "Use this whenever the user asks to find, look up, or list specific events.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Keywords to match, e.g. 'standup', 'dentist', 'Joe 1:1'. Empty matches all."
      ),
    start: z
      .string()
      .optional()
      .describe(
        "ISO datetime for the start of the search window. Defaults to 30 days ago."
      ),
    end: z
      .string()
      .optional()
      .describe(
        "ISO datetime for the end of the search window. Defaults to 90 days ahead."
      ),
  }),
  execute: async ({
    query,
    start,
    end,
  }): Promise<{
    count: number
    events: AgentEvent[]
    connected: boolean
    error?: string
  }> => {
    const startDate = start
      ? new Date(start)
      : new Date(Date.now() - 30 * DAY_MS)
    const endDate = end ? new Date(end) : new Date(Date.now() + 90 * DAY_MS)

    const result = await getEvents({ startDate, endDate })
    if (!result.success) {
      const connected = await checkGoogleConnected()
      return { count: 0, events: [], connected, error: result.error }
    }

    const q = query.trim().toLowerCase()
    const matches = result.data
      .filter((e) => {
        if (!q) return true
        return (
          e.title?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.location?.toLowerCase().includes(q)
        )
      })
      .slice(0, 20)
      .map(toAgentEvent)

    // Only pay for the connection check when there's nothing to show — that's
    // when the UI may want to nudge the user to connect Google.
    const connected = matches.length > 0 ? true : await checkGoogleConnected()

    return { count: matches.length, events: matches, connected }
  },
})

/** Retrieve the latest state of an event whose stable id is already known. */
const getEventById = tool({
  description:
    "Get the current version of a calendar event by its stable id. Use this " +
    "when an event id is available from an earlier create, search, list, or " +
    "calendar tool result, especially before updating or deleting it. This " +
    "preserves references even if the user renamed the event. Do not search by " +
    "title when you already have the id.",
  inputSchema: z.object({
    eventId: z.string().describe("The stable id of the event to retrieve."),
  }),
  execute: async ({
    eventId,
  }): Promise<{ event?: AgentEvent; error?: string }> => {
    const initial = await dbGetEventById(eventId)
    if (!initial.success) return { error: initial.error }

    await syncGoogleRange(initial.data.start, initial.data.end)
    const refreshed = await dbGetEventById(eventId)
    if (!refreshed.success) return { error: refreshed.error }
    return { event: toAgentEvent(refreshed.data) }
  },
})

/**
 * Summarize how the user is spending time in meetings over a window. Computes
 * total meeting hours, count, and a per-day breakdown so the model can give
 * recommendations and the UI can render a stats card.
 */
const calendarStats = tool({
  description:
    "Analyze how much time the user spends in meetings over a date range. " +
    "Returns total meeting hours, meeting count, the busiest day, and a per-day " +
    "breakdown. Use this for questions like 'how much time am I in meetings' or " +
    "'how busy is my week'. Defaults to the current week.",
  inputSchema: z.object({
    start: z
      .string()
      .optional()
      .describe(
        "ISO datetime for the start of the range. Defaults to the start of this week."
      ),
    end: z
      .string()
      .optional()
      .describe(
        "ISO datetime for the end of the range. Defaults to the end of this week."
      ),
  }),
  execute: async ({
    start,
    end,
  }): Promise<{
    stats?: CalendarStats
    connected: boolean
    error?: string
  }> => {
    const now = new Date()
    const startDate = start ? new Date(start) : startOfWeek(now)
    const endDate = end ? new Date(end) : endOfWeek(now)

    const result = await getEvents({ startDate, endDate })
    if (!result.success) {
      const connected = await checkGoogleConnected()
      return { connected, error: result.error }
    }

    const timed = result.data.filter((e) => !e.allDay)
    const byDayMap = new Map<string, number>()
    let totalMs = 0

    for (const e of timed) {
      const s = new Date(e.start)
      const en = new Date(e.end)
      const ms = Math.max(0, en.getTime() - s.getTime())
      totalMs += ms
      const key = format(s, "EEE MMM d")
      byDayMap.set(key, (byDayMap.get(key) ?? 0) + ms / (60 * 60 * 1000))
    }

    const byDay: DayLoad[] = [...byDayMap.entries()].map(([day, hours]) => ({
      day,
      hours: round1(hours),
    }))
    const busiestDay =
      byDay.length > 0
        ? byDay.reduce((a, b) => (b.hours > a.hours ? b : a))
        : null

    const stats: CalendarStats = {
      rangeStart: startDate.toISOString(),
      rangeEnd: endDate.toISOString(),
      totalEvents: result.data.length,
      meetingCount: timed.length,
      totalHours: round1(totalMs / (60 * 60 * 1000)),
      busiestDay,
      byDay,
    }

    const connected =
      result.data.length > 0 ? true : await checkGoogleConnected()
    return { stats, connected }
  },
})

/**
 * List all events in a window (no keyword filter), for "what's on my calendar"
 * style questions. Rendered as a day-grouped agenda.
 */
const listEvents = tool({
  description:
    "List all of the user's events within a date range (no keyword filter). " +
    "Use this for questions like 'what's on my calendar tomorrow', 'what does " +
    "my Friday look like', or 'show me next week'. Defaults to the next 7 days.",
  inputSchema: z.object({
    start: z
      .string()
      .optional()
      .describe(
        "ISO datetime for the start of the range. Defaults to the start of today."
      ),
    end: z
      .string()
      .optional()
      .describe(
        "ISO datetime for the end of the range. Defaults to 7 days from now."
      ),
  }),
  execute: async ({
    start,
    end,
  }): Promise<{
    count: number
    events: AgentEvent[]
    connected: boolean
    error?: string
  }> => {
    const now = new Date()
    const startDate = start ? new Date(start) : startOfDay(now)
    const endDate = end ? new Date(end) : endOfDay(addDays(now, 7))

    const result = await getEvents({ startDate, endDate })
    if (!result.success) {
      const connected = await checkGoogleConnected()
      return { count: 0, events: [], connected, error: result.error }
    }

    const events = result.data.slice(0, 50).map(toAgentEvent)

    const connected = events.length > 0 ? true : await checkGoogleConnected()
    return { count: events.length, events, connected }
  },
})

/** Check one exact proposed interval instead of generating alternative slots. */
const checkAvailability = tool({
  description:
    "Check whether one exact date/time window is free and return any conflicting " +
    "events. Use this when the requested start and end are already known, " +
    "including when they appear in pasted email or message text. Prefer this over " +
    "findFreeSlots for questions like 'can this interview fit from 10:30 to 3:30?'.",
  inputSchema: z.object({
    start: z.string().describe("ISO datetime for the exact requested start."),
    end: z.string().describe("ISO datetime for the exact requested end."),
  }),
  execute: async ({ start, end }): Promise<AvailabilityCheck> => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      return {
        start,
        end,
        available: false,
        conflicts: [],
        connected: await checkGoogleConnected(),
        verified: false,
        error: "The availability window is invalid.",
      }
    }

    const sync = await syncGoogleRange(startDate, endDate)
    const result = await getEvents({ startDate, endDate })
    if (!result.success) {
      return {
        start,
        end,
        available: false,
        conflicts: [],
        connected: sync.connected,
        verified: sync.synced,
        error: result.error,
      }
    }

    const conflicts = result.data
      .filter((event) => event.end > startDate && event.start < endDate)
      .map(toAgentEvent)
    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      available: conflicts.length === 0,
      conflicts,
      connected: sync.connected,
      verified: sync.synced,
    }
  },
})

/**
 * Return the user's events for a day, week, or month so the UI can render a
 * visual mini calendar. The model picks the `view`; the range is derived from
 * an anchor date (defaulting to today) in the USER'S timezone, so boundaries
 * land on the user's calendar day rather than the server's (UTC).
 */
function makeShowCalendar(timeZone?: string) {
  return tool({
    description:
      "Show the user a visual MINI CALENDAR of their events, laid out as a day, " +
      "week, or month grid. Use this when the user wants to SEE or get an overview " +
      "of their schedule — e.g. 'what does my day look like', 'show me this week', " +
      "'what do I have next week', 'how does my month look'. Pick `view`: 'day' for " +
      "a single day, 'week' for a Sun–Sat week, 'month' for a whole month. Pass " +
      "`anchor` as a plain calendar date (YYYY-MM-DD) inside the period you want " +
      "(e.g. a date in next week for 'next week'); it defaults to today. Prefer this " +
      "over listEvents when a visual layout helps the user grasp their schedule.",
    inputSchema: z.object({
      view: z
        .enum(["day", "week", "month"])
        .describe(
          "Which layout to render: 'day' (one day), 'week' (the Sun–Sat week), or 'month' (the whole month)."
        ),
      anchor: z
        .string()
        .optional()
        .describe(
          "Calendar date to display, as YYYY-MM-DD (e.g. 2026-07-20). Defaults to today. For 'next week' pass any date in that week; for a specific month pass any date in it."
        ),
    }),
    execute: async ({ view, anchor }): Promise<CalendarViewData> => {
      const { year, month, day } = anchorYMD(anchor, timeZone)

      let startDate: Date
      let endDate: Date
      if (view === "day") {
        startDate = localMidnight(year, month, day, timeZone)
        endDate = new Date(
          localMidnight(year, month, day + 1, timeZone).getTime() - 1
        )
      } else if (view === "week") {
        // Day-of-week is a property of the calendar date itself (tz-independent).
        const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
        startDate = localMidnight(year, month, day - dow, timeZone)
        endDate = new Date(
          localMidnight(year, month, day - dow + 7, timeZone).getTime() - 1
        )
      } else {
        startDate = localMidnight(year, month, 1, timeZone)
        endDate = new Date(
          localMidnight(year, month + 1, 1, timeZone).getTime() - 1
        )
      }

      const result = await getEvents({ startDate, endDate })
      if (!result.success) {
        const connected = await checkGoogleConnected()
        return {
          view,
          rangeStart: startDate.toISOString(),
          rangeEnd: endDate.toISOString(),
          events: [],
          connected,
          error: result.error,
        }
      }

      const events = result.data.slice(0, 200).map(toAgentEvent)
      const connected = events.length > 0 ? true : await checkGoogleConnected()
      return {
        view,
        rangeStart: startDate.toISOString(),
        rangeEnd: endDate.toISOString(),
        events,
        connected,
      }
    },
  })
}

/**
 * Find open time slots across the day, honoring simple constraints like a
 * minimum duration and an optional earliest/latest hour (e.g. afternoons only).
 * Used for scheduling requests such as "when am I free for a 30-min call this
 * week". Searches the whole day by default; the UI flags early-morning and
 * late-night options so the user knows when a slot is outside typical hours.
 */
const findFreeSlots = tool({
  description:
    "Find exact-duration open time options on the user's calendar when the start " +
    "time is not already known. Searches the whole day by default (the UI flags " +
    "early-morning and late-night options). Honors optional earliest/latest hour " +
    "bounds; pass them whenever the user's request or pasted source text specifies " +
    "a time-of-day window. Use for questions like 'when am I free for a 30 minute " +
    "meeting this week'. Defaults to the next 7 days.",
  inputSchema: z.object({
    durationMinutes: z
      .number()
      .describe("Required length of the slot in minutes, e.g. 30 or 60."),
    start: z
      .string()
      .optional()
      .describe(
        "ISO datetime for the start of the search range. Defaults to now."
      ),
    end: z
      .string()
      .optional()
      .describe(
        "ISO datetime for the end of the search range. Defaults to 7 days from now."
      ),
    earliestHour: z
      .number()
      .optional()
      .describe(
        "Earliest hour of day to consider (0-23). Default 0 (whole day). Set to 9 to skip early mornings."
      ),
    latestHour: z
      .number()
      .optional()
      .describe(
        "Latest hour of day to consider (1-24). Default 24 (whole day). Set to 17 to skip evenings."
      ),
    weekdaysOnly: z
      .boolean()
      .optional()
      .describe("Whether to only consider Mon–Fri. Default true."),
  }),
  execute: async ({
    durationMinutes,
    start,
    end,
    earliestHour = 0,
    latestHour = 24,
    weekdaysOnly = true,
  }): Promise<{
    slots: FreeSlot[]
    durationMinutes: number
    connected: boolean
    hasOffHours: boolean
    error?: string
  }> => {
    const now = new Date()
    const startDate = start ? new Date(start) : now
    const endDate = end ? new Date(end) : endOfDay(addDays(now, 7))

    const result = await getEvents({ startDate, endDate })
    if (!result.success) {
      const connected = await checkGoogleConnected()
      return {
        slots: [],
        durationMinutes,
        connected,
        hasOffHours: false,
        error: result.error,
      }
    }

    const busy = result.data
      .filter((e) => !e.allDay)
      .map((e) => ({ s: new Date(e.start), e: new Date(e.end) }))

    const slots: FreeSlot[] = []
    const needMs = durationMinutes * 60 * 1000

    for (let d = startOfDay(startDate); d <= endDate; d = addDays(d, 1)) {
      const dow = d.getDay()
      if (weekdaysOnly && (dow === 0 || dow === 6)) continue

      let windowStart = setHours(startOfDay(d), earliestHour)
      const windowEnd = setHours(startOfDay(d), latestHour)
      // Never suggest a slot in the past.
      if (windowStart < now) windowStart = now
      if (windowStart >= windowEnd) continue

      const dayBusy = busy
        .filter((b) => b.e > windowStart && b.s < windowEnd)
        .map((b) => ({
          s: b.s < windowStart ? windowStart : b.s,
          e: b.e > windowEnd ? windowEnd : b.e,
        }))
        .sort((a, b) => a.s.getTime() - b.s.getTime())

      let cursor = windowStart
      for (const b of dayBusy) {
        if (b.s.getTime() - cursor.getTime() >= needMs) {
          slots.push({
            start: cursor.toISOString(),
            end: new Date(cursor.getTime() + needMs).toISOString(),
            durationMinutes,
          })
        }
        if (b.e > cursor) cursor = b.e
      }
      if (windowEnd.getTime() - cursor.getTime() >= needMs) {
        slots.push({
          start: cursor.toISOString(),
          end: new Date(cursor.getTime() + needMs).toISOString(),
          durationMinutes,
        })
      }

      if (slots.length >= 12) break
    }

    const finalSlots = slots.slice(0, 12)
    const hasOffHours = finalSlots.some((s) => isOffHours(s.start, s.end))
    const connected =
      finalSlots.length > 0 ? true : await checkGoogleConnected()
    return { slots: finalSlots, durationMinutes, connected, hasOffHours }
  },
})

/**
 * Zod enum for the app's event colors. Includes a mapping hint so the model can
 * translate everyday color words (e.g. "red") into the supported palette.
 */
const eventColorSchema = z
  .enum(["sky", "amber", "violet", "rose", "emerald", "orange"])
  .describe(
    "Event color. Map the user's words to the closest option: red/pink → rose, " +
      "purple/violet → violet, green → emerald, blue → sky, yellow/gold/amber → " +
      "amber, orange → orange."
  )

const recurrenceSchema = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().min(1).max(99).optional(),
    byWeekday: z
      .array(z.number().int().min(0).max(6))
      .optional()
      .describe("Days for weekly recurrence, Sunday=0 through Saturday=6."),
    ends: z.enum(["never", "on", "after"]).optional(),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Inclusive end date for ends=on, as YYYY-MM-DD."),
    count: z
      .number()
      .int()
      .min(1)
      .max(999)
      .optional()
      .describe("Number of occurrences for ends=after."),
  })
  .optional()

/**
 * Create a new event on the user's calendar. Gated behind user approval (see
 * the route's toolApproval config) so nothing is written without confirmation.
 */
function makeCreateEvent(timeZone?: string) {
  return tool({
    description:
      "Create a new calendar event. The user must approve before it is created. " +
      "Provide ISO datetimes for start and end. For a repeating event, pass recurrence.",
    inputSchema: z.object({
      title: z.string().describe("Event title."),
      start: z.string().describe("ISO datetime for the event start."),
      end: z.string().describe("ISO datetime for the event end."),
      allDay: z.boolean().optional().describe("Whether it's an all-day event."),
      location: z.string().optional().describe("Optional location."),
      description: z.string().optional().describe("Optional description."),
      color: eventColorSchema.optional(),
      recurrence: recurrenceSchema,
    }),
    execute: async ({
      title,
      start,
      end,
      allDay,
      location,
      description,
      color,
      recurrence,
    }): Promise<{ ok: boolean; event?: AgentEvent; error?: string }> => {
      const res = await dbCreateEvent({
        id: "",
        title,
        start: new Date(start),
        end: new Date(end),
        allDay: allDay ?? false,
        location,
        description,
        color,
        recurrence: recurrence as EventRecurrence | undefined,
        timezone: timeZone,
      } as CalendarEvent)
      if (!res.success) return { ok: false, error: res.error }
      return { ok: true, event: toAgentEvent(res.data) }
    },
  })
}

/** Update an existing event (by id). Gated behind user approval. */
const updateEvent = tool({
  description:
    "Update an existing calendar event by its id (reschedule, rename, move, recolor, etc). " +
    "The user must approve before changes are applied. Pass `eventTitle` only as " +
    "display context for the confirmation card; it is never written. Only pass " +
    "`title` when the user explicitly wants to rename the event, and otherwise " +
    "pass only fields that change. If an earlier tool result contains the event " +
    "id, call getEventById to refresh it instead of searching by title.",
  inputSchema: z.object({
    eventId: z.string().describe("The id of the event to update."),
    eventTitle: z
      .string()
      .describe(
        "Current event title for the confirmation card. This is not written."
      ),
    title: z
      .string()
      .optional()
      .describe("New event title. Only pass when renaming."),
    start: z.string().optional().describe("New ISO start datetime."),
    end: z.string().optional().describe("New ISO end datetime."),
    allDay: z.boolean().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    color: eventColorSchema.optional(),
    recurrenceScope: z
      .enum(["single", "following", "series"])
      .optional()
      .describe(
        "For a recurring event: 'single' updates only this occurrence, 'following' updates this and all later occurrences, 'series' updates every occurrence. Defaults to single."
      ),
  }),
  execute: async ({
    eventId,
    title,
    start,
    end,
    allDay,
    location,
    description,
    color,
    recurrenceScope,
  }): Promise<{ ok: boolean; event?: AgentEvent; error?: string }> => {
    const updates: Partial<CalendarEvent> = {}
    if (title !== undefined) updates.title = title
    if (start) updates.start = new Date(start)
    if (end) updates.end = new Date(end)
    if (allDay !== undefined) updates.allDay = allDay
    if (location !== undefined) updates.location = location
    if (description !== undefined) updates.description = description
    if (color !== undefined) updates.color = color

    const res = await dbUpdateEvent(
      eventId,
      updates,
      recurrenceScope as RecurrenceScope | undefined
    )
    if (!res.success) return { ok: false, error: res.error }
    return { ok: true, event: toAgentEvent(res.data) }
  },
})

/** Delete an event (by id). Gated behind user approval. */
const deleteEvent = tool({
  description:
    "Delete a calendar event by its id. The user must approve before it is " +
    "deleted. Find the event id first via searchEvents or listEvents. Pass the " +
    "title too so the confirmation is clear.",
  inputSchema: z.object({
    eventId: z.string().describe("The id of the event to delete."),
    title: z
      .string()
      .optional()
      .describe("The event title, for the confirmation card."),
    recurrenceScope: z
      .enum(["single", "following", "series"])
      .optional()
      .describe(
        "For a recurring event: 'single' deletes only this occurrence, 'following' deletes this and all later occurrences, 'series' deletes every occurrence. Defaults to single."
      ),
  }),
  execute: async ({
    eventId,
    recurrenceScope,
  }): Promise<{ ok: boolean; error?: string }> => {
    const res = await dbDeleteEvent(
      eventId,
      recurrenceScope as RecurrenceScope | undefined
    )
    if (!res.success) return { ok: false, error: res.error }
    return { ok: true }
  },
})

/**
 * Build the calendar toolset for a request. Pass the user's IANA timezone so
 * `showCalendar` derives day/week/month boundaries on the user's calendar day
 * (not the server's UTC day).
 */
export function buildCalendarTools(timeZone?: string) {
  return {
    searchEvents,
    getEventById,
    calendarStats,
    listEvents,
    checkAvailability,
    showCalendar: makeShowCalendar(timeZone),
    findFreeSlots,
    createEvent: makeCreateEvent(timeZone),
    updateEvent,
    deleteEvent,
  }
}

/** Tools that mutate the calendar and therefore require user approval. */
export const APPROVAL_TOOLS = [
  "createEvent",
  "updateEvent",
  "deleteEvent",
] as const
