import type {
  CalendarEvent,
  EventColor,
  EventRecurrence,
} from '@/components/event-calendar/types'

/** An event row as stored in the `events` table. */
export interface DbEvent {
  id: string
  user_id: string
  title: string
  description: string | null
  start_time: string // ISO timestamp
  end_time: string // ISO timestamp
  all_day: boolean
  color: EventColor | null
  location: string | null
  timezone: string | null
  google_event_id: string | null
  google_calendar_id: string
  etag: string | null
  source: 'local' | 'google'
  recurrence: EventRecurrence | null
  recurring_event_id: string | null
  original_start_time: string | null
  created_at: string
  updated_at: string
}

export interface EventInsert {
  title: string
  description?: string | null
  start_time: string
  end_time: string
  all_day?: boolean
  color?: EventColor | null
  location?: string | null
  timezone?: string | null
  google_event_id?: string | null
  google_calendar_id?: string
  etag?: string | null
  source?: 'local' | 'google'
  recurrence?: EventRecurrence | null
  recurring_event_id?: string | null
  original_start_time?: string | null
}

export interface EventUpdate {
  title?: string
  description?: string | null
  start_time?: string
  end_time?: string
  all_day?: boolean
  color?: EventColor | null
  location?: string | null
  timezone?: string | null
  google_event_id?: string | null
  etag?: string | null
  recurrence?: EventRecurrence | null
  recurring_event_id?: string | null
  original_start_time?: string | null
}

export interface EventQueryParams {
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}

/** Transform a database row into the frontend `CalendarEvent`. */
export function dbEventToCalendarEvent(dbEvent: DbEvent): CalendarEvent {
  return {
    id: dbEvent.id,
    title: dbEvent.title,
    description: dbEvent.description ?? undefined,
    start: new Date(dbEvent.start_time),
    end: new Date(dbEvent.end_time),
    allDay: dbEvent.all_day,
    color: dbEvent.color ?? undefined,
    location: dbEvent.location ?? undefined,
    timezone: dbEvent.timezone ?? undefined,
    recurrence: dbEvent.recurrence ?? undefined,
    recurringEventId: dbEvent.recurring_event_id ?? undefined,
    originalStart: dbEvent.original_start_time ?? undefined,
  }
}

export function calendarEventToDbInsert(event: CalendarEvent): EventInsert {
  return {
    title: event.title || '(no title)',
    description: event.description ?? null,
    start_time: event.start.toISOString(),
    end_time: event.end.toISOString(),
    all_day: event.allDay ?? false,
    color: event.color ?? null,
    location: event.location ?? null,
    timezone: event.timezone ?? null,
    recurrence: event.recurrence ?? null,
    recurring_event_id: event.recurringEventId ?? null,
    original_start_time: event.originalStart ?? null,
  }
}

export function calendarEventToDbUpdate(event: Partial<CalendarEvent>): EventUpdate {
  const update: EventUpdate = {}

  if (event.title !== undefined) update.title = event.title || '(no title)'
  if (event.description !== undefined) update.description = event.description ?? null
  if (event.start !== undefined) update.start_time = event.start.toISOString()
  if (event.end !== undefined) update.end_time = event.end.toISOString()
  if (event.allDay !== undefined) update.all_day = event.allDay
  if (event.color !== undefined) update.color = event.color ?? null
  if (event.location !== undefined) update.location = event.location ?? null
  if (event.timezone !== undefined) update.timezone = event.timezone ?? null
  if (event.recurrence !== undefined) update.recurrence = event.recurrence ?? null
  if (event.recurringEventId !== undefined) {
    update.recurring_event_id = event.recurringEventId ?? null
  }
  if (event.originalStart !== undefined) {
    update.original_start_time = event.originalStart ?? null
  }

  return update
}
