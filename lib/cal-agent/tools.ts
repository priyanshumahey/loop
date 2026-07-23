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
import {
  getInboxEmail,
  getInboxThread,
  isGoogleConnected,
  listInboxEmails,
  pullGoogleEvents,
} from "@/lib/google-sync"
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

/** Gmail's inbox category tabs, normalized. */
export type EmailCategory =
  | "primary"
  | "social"
  | "promotions"
  | "updates"
  | "forums"

/** A compact email shape returned to the model and rendered by the UI. */
export interface AgentEmail {
  id: string
  threadId: string
  from: string
  fromEmail: string
  subject: string
  snippet: string
  /** ISO datetime when parseable, otherwise the raw `Date` header. */
  date: string
  unread: boolean
  /** Whether Gmail flagged the message as important. */
  important: boolean
  /** Whether the user has starred the message. */
  starred: boolean
  /** Which inbox tab Gmail sorted it into, when known. */
  category: EmailCategory | null
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
// ---------------------------------------------------------------------------
// Email (Gmail)
// ---------------------------------------------------------------------------

/** Split an RFC 5322 address header into a display name and bare address. */
function parseSender(header: string): { name: string; email: string } {
  const trimmed = (header ?? "").trim()
  const match = trimmed.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (match) {
    const name = match[1].trim()
    const email = match[2].trim()
    return { name: name || email, email }
  }
  return { name: trimmed, email: trimmed }
}

/** Normalize Gmail's CATEGORY_* labels into a single inbox tab. */
function gmailCategory(labels: string[]): EmailCategory | null {
  if (labels.includes("CATEGORY_SOCIAL")) return "social"
  if (labels.includes("CATEGORY_PROMOTIONS")) return "promotions"
  if (labels.includes("CATEGORY_UPDATES")) return "updates"
  if (labels.includes("CATEGORY_FORUMS")) return "forums"
  if (labels.includes("CATEGORY_PERSONAL")) return "primary"
  return null
}

/** Map a fetched Gmail message to the compact shape the model + UI use. */
function toAgentEmail(msg: {
  id: string
  threadId: string
  from: string
  subject: string
  snippet: string
  date: string
  unread: boolean
  labels: string[]
}): AgentEmail {
  const sender = parseSender(msg.from)
  const parsed = new Date(msg.date)
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: sender.name,
    fromEmail: sender.email,
    subject: msg.subject || "(no subject)",
    snippet: msg.snippet,
    date: Number.isNaN(parsed.getTime()) ? msg.date : parsed.toISOString(),
    unread: msg.unread,
    important: msg.labels.includes("IMPORTANT"),
    starred: msg.labels.includes("STARRED"),
    category: gmailCategory(msg.labels),
  }
}

/** Resolve the authenticated user's Supabase client and id (or null). */
async function currentUser(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/** Normalize a date-ish input to Gmail's `YYYY/MM/DD` query format. */
function toGmailDate(value: string): string | null {
  const trimmed = value.trim()
  // Already a bare calendar date (YYYY-MM-DD or YYYY/MM/DD).
  const bare = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/)
  if (bare) return `${bare[1]}/${bare[2]}/${bare[3]}`
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, "0")
  const d = String(parsed.getDate()).padStart(2, "0")
  return `${y}/${m}/${d}`
}

/** Compile structured email filters (plus a raw escape hatch) into a Gmail query. */
function buildGmailQuery(opts: {
  unreadOnly?: boolean
  from?: string
  subject?: string
  after?: string
  before?: string
  hasAttachment?: boolean
  category?: EmailCategory
  query?: string
}): string {
  const parts: string[] = []
  if (opts.unreadOnly) parts.push("is:unread")
  if (opts.from) parts.push(`from:(${opts.from.trim()})`)
  if (opts.subject) parts.push(`subject:(${opts.subject.trim()})`)
  if (opts.hasAttachment) parts.push("has:attachment")
  if (opts.category) parts.push(`category:${opts.category}`)
  if (opts.after) {
    const d = toGmailDate(opts.after)
    if (d) parts.push(`after:${d}`)
  }
  if (opts.before) {
    const d = toGmailDate(opts.before)
    if (d) parts.push(`before:${d}`)
  }
  if (opts.query?.trim()) parts.push(opts.query.trim())
  return parts.join(" ")
}

/**
 * List messages from the user's Gmail inbox. Supports fetching the most recent
 * N messages, unread-only, structured filters, or a raw Gmail query. Read-only.
 */
const listEmails = tool({
  description:
    "List or search the user's Gmail. Use this whenever the user " +
    "asks to see, get, fetch, find, look up, triage, or summarize their emails " +
    "— e.g. 'show my last 100 emails', 'any unread mail?', 'emails from Stripe " +
    "last week', 'find the Onos Health thread', 'what needs a reply'. When a " +
    "from, subject, or raw query filter is given, this searches ALL of the " +
    "user's mail (including archived and sent messages under every label — Spam " +
    "and Trash excluded), not just the inbox, so a specific message is found " +
    "even after it's been archived. Prefer the structured filters (from, " +
    "subject, after, " +
    "my last 100 emails', 'any unread mail?', 'emails from Stripe last week', " +
    "'what needs a reply'. Prefer the structured filters (from, subject, after, " +
    "before, hasAttachment, category, unreadOnly) over the raw query field; use " +
    "query only for advanced Gmail operators. Dates go in after/before as " +
    "YYYY-MM-DD. Each result includes unread/important/starred/category signals " +
    "you can use to triage.",
  inputSchema: z.object({
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("How many messages to fetch (1–100). Defaults to 20."),
    unreadOnly: z
      .boolean()
      .optional()
      .describe("When true, only return unread messages."),
    from: z
      .string()
      .optional()
      .describe("Filter by sender name or address, e.g. 'stripe' or 'boss@acme.com'."),
    subject: z
      .string()
      .optional()
      .describe("Filter by words in the subject, e.g. 'invoice'."),
    after: z
      .string()
      .optional()
      .describe("Only messages on/after this date (YYYY-MM-DD)."),
    before: z
      .string()
      .optional()
      .describe("Only messages before this date (YYYY-MM-DD)."),
    hasAttachment: z
      .boolean()
      .optional()
      .describe("When true, only messages that have attachments."),
    category: z
      .enum(["primary", "social", "promotions", "updates", "forums"])
      .optional()
      .describe("Limit to a Gmail inbox tab/category."),
    query: z
      .string()
      .optional()
      .describe(
        "Advanced escape hatch: raw Gmail search operators, e.g. 'is:starred', " +
          "'newer_than:2d', 'label:work'. Combined with the structured filters."
      ),
  }),
  execute: async ({
    maxResults,
    unreadOnly,
    from,
    subject,
    after,
    before,
    hasAttachment,
    category,
    query,
  }): Promise<{
    count: number
    emails: AgentEmail[]
    connected: boolean
    unreadOnly: boolean
    query?: string
    error?: string
  }> => {
    const auth = await currentUser()
    if (!auth) {
      return {
        count: 0,
        emails: [],
        connected: false,
        unreadOnly: Boolean(unreadOnly),
      }
    }

    const gmailQuery = buildGmailQuery({
      unreadOnly,
      from,
      subject,
      after,
      before,
      hasAttachment,
      category,
      query,
    })

    // When the user is looking for a specific message (by sender, subject, or
    // raw query), search all mail rather than just the inbox so archived/sent
    // messages are found too. Plain inbox listings stay inbox-only.
    const includeAllMail = Boolean(
      from?.trim() || subject?.trim() || query?.trim()
    )

    try {
      const { connected, messages } = await listInboxEmails(
        auth.supabase,
        auth.userId,
        {
          maxResults: maxResults ?? 20,
          query: gmailQuery || undefined,
          includeAllMail,
        }
      )
      const emails = messages.map(toAgentEmail)
      return {
        count: emails.length,
        emails,
        connected,
        unreadOnly: Boolean(unreadOnly),
        query: gmailQuery || undefined,
      }
    } catch (error) {
      return {
        count: 0,
        emails: [],
        connected: true,
        unreadOnly: Boolean(unreadOnly),
        query: gmailQuery || undefined,
        error: error instanceof Error ? error.message : "Failed to load emails",
      }
    }
  },
})

/**
 * Read one email in full, including its body text. Use after listEmails when
 * the user wants the contents of a specific message. Read-only.
 */
const readEmail = tool({
  description:
    "Fetch the full contents (including body) of a single Gmail message by its " +
    "id. Use this after listEmails when the user wants to read or summarize a " +
    "specific email. Reuse the id from a prior listEmails result.",
  inputSchema: z.object({
    emailId: z.string().describe("The Gmail message id to read."),
  }),
  execute: async ({
    emailId,
  }): Promise<{
    connected: boolean
    email?: AgentEmail & { body: string }
    error?: string
  }> => {
    const auth = await currentUser()
    if (!auth) return { connected: false }

    try {
      const { connected, message } = await getInboxEmail(
        auth.supabase,
        auth.userId,
        emailId
      )
      if (!connected) return { connected: false }
      if (!message) return { connected: true, error: "Email not found" }

      const body = message.bodyText || message.snippet
      return {
        connected: true,
        email: { ...toAgentEmail(message), body },
      }
    } catch (error) {
      return {
        connected: true,
        error: error instanceof Error ? error.message : "Failed to read email",
      }
    }
  },
})

/** One message within a thread, in the compact agent shape plus its body. */
export type AgentThreadMessage = AgentEmail & { body: string }

/**
 * Read a whole conversation thread (all messages, oldest → newest) with each
 * body included. Use when the user wants the full back-and-forth, not just one
 * message. Read-only.
 */
const readThread = tool({
  description:
    "Fetch every message in a Gmail conversation thread (oldest to newest), " +
    "each with its body, so you can summarize or answer questions about the " +
    "whole exchange. Use the threadId from a prior listEmails or readEmail " +
    "result when the user asks about a conversation, reply chain, or 'the " +
    "whole thread'.",
  inputSchema: z.object({
    threadId: z.string().describe("The Gmail thread id to read."),
  }),
  execute: async ({
    threadId,
  }): Promise<{
    connected: boolean
    count: number
    subject?: string
    messages: AgentThreadMessage[]
    error?: string
  }> => {
    const auth = await currentUser()
    if (!auth) return { connected: false, count: 0, messages: [] }

    try {
      const { connected, messages } = await getInboxThread(
        auth.supabase,
        auth.userId,
        threadId
      )
      if (!connected) return { connected: false, count: 0, messages: [] }

      const mapped: AgentThreadMessage[] = messages.map((m) => ({
        ...toAgentEmail(m),
        body: m.bodyText || m.snippet,
      }))
      return {
        connected: true,
        count: mapped.length,
        subject: mapped[0]?.subject,
        messages: mapped,
      }
    } catch (error) {
      return {
        connected: true,
        count: 0,
        messages: [],
        error: error instanceof Error ? error.message : "Failed to read thread",
      }
    }
  },
})

/** A reply the assistant composed, shown as a read-only email-style card. */
export interface AgentDraft {
  to: string
  subject: string
  body: string
}

/**
 * Compose a draft reply and surface it as an email-styled card. Does NOT send —
 * loop has no send capability; this gives the user a ready-to-copy starting
 * point. Read-only.
 */
const draftReply = tool({
  description:
    "Compose a draft reply to an email and show it as an email-style card. Use " +
    "when the user asks to draft, write, or reply to a message. FIRST read the " +
    "email or thread (readEmail / readThread) so the draft has real context, " +
    "then call this with a composed to, subject, and body. This does NOT send " +
    "the email — it presents a copy-ready draft. Write the body in the user's " +
    "voice: concise, professional, and specific to the message being answered.",
  inputSchema: z.object({
    to: z
      .string()
      .describe(
        "Recipient address(es), comma-separated. Usually the sender of the email being replied to."
      ),
    subject: z
      .string()
      .describe("Subject line, e.g. 'Re: <original subject>'."),
    body: z
      .string()
      .describe(
        "The full reply body as plain text, ready to send — greeting, message, and sign-off."
      ),
  }),
  execute: async ({
    to,
    subject,
    body,
  }): Promise<{ draft: AgentDraft }> => {
    return { draft: { to, subject, body } }
  },
})

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
    listEmails,
    readEmail,
    readThread,
    draftReply,
  }
}

/** Tools that mutate the calendar and therefore require user approval. */
export const APPROVAL_TOOLS = [
  "createEvent",
  "updateEvent",
  "deleteEvent",
] as const
