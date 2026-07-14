import type { CalendarEvent } from '@/components/event-calendar/types'
import {
  calendarEventToDbInsert,
  calendarEventToDbUpdate,
  dbEventToCalendarEvent,
  type DbEvent,
  type EventQueryParams,
} from '@/lib/db/types'
import type { GoogleEventInput } from '@/lib/google'
import {
  patchEventOnGoogle,
  pushEventToGoogle,
  removeEventFromGoogle,
} from '@/lib/google-sync'
import { createClient } from '@/lib/supabase/server'

const EVENTS_TABLE = 'events'

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

function rowToGoogleInput(row: DbEvent): GoogleEventInput {
  return {
    title: row.title,
    description: row.description,
    start: new Date(row.start_time).toISOString(),
    end: new Date(row.end_time).toISOString(),
    allDay: row.all_day,
    location: row.location,
    timezone: row.timezone,
  }
}

/** Get events for the current user, optionally filtered to a time window. */
export async function getEvents(
  params?: EventQueryParams
): Promise<ServiceResult<CalendarEvent[]>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Unauthorized' }

    let query = supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('user_id', user.id)
      .order('start_time', { ascending: true })

    if (params?.startDate) query = query.gte('end_time', params.startDate.toISOString())
    if (params?.endDate) query = query.lte('start_time', params.endDate.toISOString())
    if (params?.limit) query = query.limit(params.limit)
    if (params?.offset) {
      query = query.range(params.offset, params.offset + (params.limit ?? 100) - 1)
    }

    const { data, error } = await query
    if (error) return { success: false, error: error.message }

    return { success: true, data: (data as DbEvent[]).map(dbEventToCalendarEvent) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getEventById(
  eventId: string
): Promise<ServiceResult<CalendarEvent>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Unauthorized' }

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('id', eventId)
      .eq('user_id', user.id)
      .single()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: false, error: 'Event not found' }

    return { success: true, data: dbEventToCalendarEvent(data as DbEvent) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/** Create an event locally, then best-effort push it to Google Calendar. */
export async function createEvent(
  event: CalendarEvent
): Promise<ServiceResult<CalendarEvent>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Unauthorized' }

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .insert({ ...calendarEventToDbInsert(event), user_id: user.id })
      .select()
      .single()

    if (error) return { success: false, error: error.message }

    let row = data as DbEvent

    try {
      const linkage = await pushEventToGoogle(supabase, user.id, rowToGoogleInput(row))
      if (linkage) {
        const { data: updated } = await supabase
          .from(EVENTS_TABLE)
          .update({ google_event_id: linkage.googleEventId, etag: linkage.etag })
          .eq('id', row.id)
          .eq('user_id', user.id)
          .select()
          .single()
        if (updated) row = updated as DbEvent
      }
    } catch (err) {
      console.error('Failed to push new event to Google:', err)
    }

    return { success: true, data: dbEventToCalendarEvent(row) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/** Update an event locally, then best-effort mirror the change to Google. */
export async function updateEvent(
  eventId: string,
  updates: Partial<CalendarEvent>
): Promise<ServiceResult<CalendarEvent>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Unauthorized' }

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .update(calendarEventToDbUpdate(updates))
      .eq('id', eventId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: false, error: 'Event not found' }

    const row = data as DbEvent

    if (row.google_event_id) {
      try {
        const res = await patchEventOnGoogle(
          supabase,
          user.id,
          row.google_event_id,
          rowToGoogleInput(row)
        )
        if (res && res.etag !== row.etag) {
          await supabase
            .from(EVENTS_TABLE)
            .update({ etag: res.etag })
            .eq('id', row.id)
            .eq('user_id', user.id)
        }
      } catch (err) {
        console.error('Failed to push event update to Google:', err)
      }
    }

    return { success: true, data: dbEventToCalendarEvent(row) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/** Delete an event locally, then best-effort remove it from Google. */
export async function deleteEvent(eventId: string): Promise<ServiceResult<void>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Unauthorized' }

    const { data: existing } = await supabase
      .from(EVENTS_TABLE)
      .select('google_event_id')
      .eq('id', eventId)
      .eq('user_id', user.id)
      .maybeSingle()

    const { error } = await supabase
      .from(EVENTS_TABLE)
      .delete()
      .eq('id', eventId)
      .eq('user_id', user.id)

    if (error) return { success: false, error: error.message }

    const googleEventId = (existing as { google_event_id: string | null } | null)
      ?.google_event_id
    if (googleEventId) {
      try {
        await removeEventFromGoogle(supabase, user.id, googleEventId)
      } catch (err) {
        console.error('Failed to remove event from Google:', err)
      }
    }

    return { success: true, data: undefined }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
