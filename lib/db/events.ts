import type {
  CalendarEvent,
  RecurrenceScope,
} from '@/components/event-calendar/types'
import {
  calendarEventToDbInsert,
  calendarEventToDbUpdate,
  dbEventToCalendarEvent,
  type DbEvent,
  type EventQueryParams,
  type EventUpdate,
} from '@/lib/db/types'
import type { GoogleEventInput } from '@/lib/google'
import {
  patchEventOnGoogle,
  patchEventSeriesOnGoogle,
  pushEventToGoogle,
  removeEventFromGoogle,
  splitEventSeriesOnGoogle,
} from '@/lib/google-sync'
import {
  calendarDateToUtc,
  recurrenceToGoogleRule,
  shiftByWallTimeChange,
} from '@/lib/recurrence'
import type { ServiceResult } from '@/lib/db/service'
import { createClient } from '@/lib/supabase/server'

const EVENTS_TABLE = 'events'

function rowToGoogleInput(row: DbEvent): GoogleEventInput {
  const timezone = row.timezone ?? 'UTC'
  return {
    title: row.title,
    description: row.description,
    start: new Date(row.start_time).toISOString(),
    end: new Date(row.end_time).toISOString(),
    allDay: row.all_day,
    location: row.location,
    timezone,
    recurrence: row.recurrence
      ? [
          recurrenceToGoogleRule(row.recurrence, {
            allDay: row.all_day,
            timeZone: timezone,
          }),
        ]
      : undefined,
  }
}

function changedUpdate(row: DbEvent, update: EventUpdate): EventUpdate {
  const changed: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(update)) {
    const current = row[key as keyof DbEvent]
    const equal =
      key === 'start_time' || key === 'end_time'
        ? new Date(current as string).getTime() === new Date(value as string).getTime()
        : key === 'recurrence'
          ? JSON.stringify(current) === JSON.stringify(value)
          : current === value
    if (!equal) changed[key] = value
  }

  return changed as EventUpdate
}

function seriesGoogleFields(update: EventUpdate) {
  const fields = new Set<
    | 'title'
    | 'description'
    | 'start'
    | 'end'
    | 'allDay'
    | 'location'
    | 'timezone'
  >()
  if (update.title !== undefined) fields.add('title')
  if (update.description !== undefined) fields.add('description')
  if (update.start_time !== undefined) fields.add('start')
  if (update.end_time !== undefined) fields.add('end')
  if (update.all_day !== undefined) fields.add('allDay')
  if (update.location !== undefined) fields.add('location')
  if (update.timezone !== undefined) fields.add('timezone')
  return fields
}

function updateSeriesRow(
  row: DbEvent,
  selectedBefore: DbEvent,
  selectedAfter: DbEvent,
  changes: EventUpdate
): EventUpdate {
  const update: EventUpdate = { ...changes, etag: null }
  const timeZone = selectedAfter.timezone ?? selectedBefore.timezone ?? 'UTC'
  const scheduledStart = selectedBefore.original_start_time
    ? /^\d{4}-\d{2}-\d{2}$/.test(selectedBefore.original_start_time)
      ? calendarDateToUtc(selectedBefore.original_start_time, timeZone)
      : new Date(selectedBefore.original_start_time)
    : new Date(selectedBefore.start_time)
  const rowScheduledStart = row.original_start_time
    ? /^\d{4}-\d{2}-\d{2}$/.test(row.original_start_time)
      ? calendarDateToUtc(row.original_start_time, timeZone)
      : new Date(row.original_start_time)
    : new Date(row.start_time)
  let nextStart = new Date(row.start_time)

  if (changes.start_time !== undefined) {
    nextStart = shiftByWallTimeChange(
      rowScheduledStart,
      scheduledStart,
      new Date(selectedAfter.start_time),
      timeZone
    )
    update.start_time = nextStart.toISOString()
  }
  if (changes.end_time !== undefined) {
    const desiredDuration =
      new Date(selectedAfter.end_time).getTime() -
      new Date(selectedAfter.start_time).getTime()
    update.end_time = new Date(nextStart.getTime() + desiredDuration).toISOString()
  } else if (changes.start_time !== undefined) {
    const currentDuration =
      new Date(row.end_time).getTime() - new Date(row.start_time).getTime()
    update.end_time = new Date(nextStart.getTime() + currentDuration).toISOString()
  }

  return update
}

/**
 * Local ids of the occurrences at or after `boundary` in a series, keyed by the
 * scheduled (original) start so a moved instance is still classified by when it
 * was scheduled. Used to prune the tail of a series after a "this and
 * following" split; the fresh series is re-imported on the next Google pull.
 */
async function tailInstances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  row: DbEvent,
  boundary: string
): Promise<DbEvent[]> {
  const { data } = await supabase
    .from(EVENTS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('google_calendar_id', row.google_calendar_id)
    .eq('recurring_event_id', row.recurring_event_id)

  const boundaryMs = new Date(boundary).getTime()
  return ((data ?? []) as DbEvent[]).filter((instance) => {
    const scheduled = instance.original_start_time ?? instance.start_time
    return new Date(scheduled).getTime() >= boundaryMs
  })
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

    if (params?.startDate) query = query.gt('end_time', params.startDate.toISOString())
    if (params?.endDate) query = query.lt('start_time', params.endDate.toISOString())
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
      } else if (row.recurrence) {
        await supabase.from(EVENTS_TABLE).delete().eq('id', row.id).eq('user_id', user.id)
        return {
          success: false,
          error: 'Connect Google Calendar before creating a recurring event',
        }
      }
    } catch (err) {
      if (row.recurrence) {
        await supabase.from(EVENTS_TABLE).delete().eq('id', row.id).eq('user_id', user.id)
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create recurring event',
        }
      }
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
  updates: Partial<CalendarEvent>,
  recurrenceScope: RecurrenceScope = 'single'
): Promise<ServiceResult<CalendarEvent>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Unauthorized' }

    const { data: existing, error: existingError } = await supabase
      .from(EVENTS_TABLE)
      .select('*')
      .eq('id', eventId)
      .eq('user_id', user.id)
      .single()

    if (existingError) return { success: false, error: existingError.message }
    if (!existing) return { success: false, error: 'Event not found' }

    const before = existing as DbEvent
    const changes = changedUpdate(before, calendarEventToDbUpdate(updates))
    if (Object.keys(changes).length === 0) {
      return { success: true, data: dbEventToCalendarEvent(before) }
    }
    const after = { ...before, ...changes } as DbEvent

    if (recurrenceScope === 'series' && before.recurring_event_id) {
      const googleFields = seriesGoogleFields(changes)
      const recurrenceChanged = changes.recurrence !== undefined
      if (googleFields.size > 0 || recurrenceChanged) {
        const newRecurrence =
          recurrenceChanged && after.recurrence
            ? [
                recurrenceToGoogleRule(after.recurrence, {
                  allDay: after.all_day,
                  timeZone: after.timezone ?? 'UTC',
                }),
              ]
            : undefined
        const updatedGoogle = await patchEventSeriesOnGoogle(
          supabase,
          user.id,
          before.recurring_event_id,
          rowToGoogleInput(before),
          rowToGoogleInput(after),
          googleFields,
          newRecurrence,
          before.original_start_time
        )
        if (!updatedGoogle) {
          return {
            success: false,
            error: 'Connect Google Calendar to update the recurring series',
          }
        }
      }

      const { data: instances, error: instancesError } = await supabase
        .from(EVENTS_TABLE)
        .select('*')
        .eq('user_id', user.id)
        .eq('google_calendar_id', before.google_calendar_id)
        .eq('recurring_event_id', before.recurring_event_id)
      if (instancesError) return { success: false, error: instancesError.message }

      let selected = after
      for (const instance of (instances ?? []) as DbEvent[]) {
        const { data: updated, error } = await supabase
          .from(EVENTS_TABLE)
          .update(updateSeriesRow(instance, before, after, changes))
          .eq('id', instance.id)
          .eq('user_id', user.id)
          .select()
          .single()
        if (error) return { success: false, error: error.message }
        if (updated && instance.id === eventId) selected = updated as DbEvent
      }

      return { success: true, data: dbEventToCalendarEvent(selected) }
    }

    if (recurrenceScope === 'following' && before.recurring_event_id) {
      const boundary = before.original_start_time ?? before.start_time
      const result = await splitEventSeriesOnGoogle(
        supabase,
        user.id,
        before.recurring_event_id,
        boundary,
        {
          timeZone: before.timezone ?? undefined,
          edit: {
            after: rowToGoogleInput(after),
            changedFields: seriesGoogleFields(changes),
          },
        }
      )
      if (!result) {
        return {
          success: false,
          error: 'Connect Google Calendar to update this and following events',
        }
      }

      if (result.reusedOriginalSeries) {
        const { data: instances, error: instancesError } = await supabase
          .from(EVENTS_TABLE)
          .select('*')
          .eq('user_id', user.id)
          .eq('google_calendar_id', before.google_calendar_id)
          .eq('recurring_event_id', before.recurring_event_id)
        if (instancesError) {
          return { success: false, error: instancesError.message }
        }

        let selected = after
        for (const instance of (instances ?? []) as DbEvent[]) {
          const { data: updated, error } = await supabase
            .from(EVENTS_TABLE)
            .update(updateSeriesRow(instance, before, after, changes))
            .eq('id', instance.id)
            .eq('user_id', user.id)
            .select()
            .single()
          if (error) return { success: false, error: error.message }
          if (updated && instance.id === eventId) selected = updated as DbEvent
        }
        return { success: true, data: dbEventToCalendarEvent(selected) }
      }

      // Apply the tail edit to the existing local rows with etag cleared; the
      // next pull reconciles them to the new series' instances.
      const tail = await tailInstances(supabase, user.id, before, boundary)
      let selected = after
      for (const instance of tail) {
        const { data: updated, error } = await supabase
          .from(EVENTS_TABLE)
          .update(updateSeriesRow(instance, before, after, changes))
          .eq('id', instance.id)
          .eq('user_id', user.id)
          .select()
          .single()
        if (error) return { success: false, error: error.message }
        if (updated && instance.id === eventId) selected = updated as DbEvent
      }

      return { success: true, data: dbEventToCalendarEvent(selected) }
    }

    let recurringInstanceEtag: string | null | undefined
    if (before.recurring_event_id && before.google_event_id) {
      // Instances must not carry a `recurrence` field — only the parent does.
      const result = await patchEventOnGoogle(
        supabase,
        user.id,
        before.google_event_id,
        { ...rowToGoogleInput(after), recurrence: undefined },
        before.etag
      )
      if (!result) {
        return {
          success: false,
          error: 'Connect Google Calendar to update this recurring event',
        }
      }
      recurringInstanceEtag = result.etag
      changes.etag = result.etag
    }

    const { data, error } = await supabase
      .from(EVENTS_TABLE)
      .update(changes)
      .eq('id', eventId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: false, error: 'Event not found' }

    const row = data as DbEvent

    if (row.google_event_id && recurringInstanceEtag === undefined) {
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
export async function deleteEvent(
  eventId: string,
  recurrenceScope: RecurrenceScope = 'single'
): Promise<ServiceResult<void>> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Unauthorized' }

    const { data: existing } = await supabase
      .from(EVENTS_TABLE)
      .select(
        'google_event_id, google_calendar_id, recurring_event_id, original_start_time, start_time'
      )
      .eq('id', eventId)
      .eq('user_id', user.id)
      .maybeSingle()

    const linked = existing as {
      google_event_id: string | null
      google_calendar_id: string
      recurring_event_id: string | null
      original_start_time: string | null
      start_time: string
    } | null

    if (recurrenceScope === 'following' && linked?.recurring_event_id) {
      const boundary = linked.original_start_time ?? linked.start_time
      const result = await splitEventSeriesOnGoogle(
        supabase,
        user.id,
        linked.recurring_event_id,
        boundary,
        {}
      )
      if (!result) {
        return {
          success: false,
          error: 'Connect Google Calendar to delete this and following events',
        }
      }

      const staleIds = (
        await tailInstances(
        supabase,
        user.id,
        {
          google_calendar_id: linked.google_calendar_id,
          recurring_event_id: linked.recurring_event_id,
        } as DbEvent,
        boundary
        )
      ).map((instance) => instance.id)
      if (staleIds.length > 0) {
        await supabase
          .from(EVENTS_TABLE)
          .delete()
          .in('id', staleIds)
          .eq('user_id', user.id)
      }
      return { success: true, data: undefined }
    }

    if (
      recurrenceScope === 'single' &&
      linked?.recurring_event_id &&
      linked.google_event_id
    ) {
      const removed = await removeEventFromGoogle(
        supabase,
        user.id,
        linked.google_event_id
      )
      if (!removed) {
        return {
          success: false,
          error: 'Connect Google Calendar to delete this recurring event',
        }
      }
    }

    if (recurrenceScope === 'series' && linked?.recurring_event_id) {
      const removed = await removeEventFromGoogle(
        supabase,
        user.id,
        linked.recurring_event_id
      )
      if (!removed) {
        return {
          success: false,
          error: 'Connect Google Calendar to delete the recurring series',
        }
      }

      const { error: instancesError } = await supabase
        .from(EVENTS_TABLE)
        .delete()
        .eq('user_id', user.id)
        .eq('google_calendar_id', linked.google_calendar_id)
        .eq('recurring_event_id', linked.recurring_event_id)
      if (instancesError) return { success: false, error: instancesError.message }

      await supabase
        .from(EVENTS_TABLE)
        .delete()
        .eq('user_id', user.id)
        .eq('google_calendar_id', linked.google_calendar_id)
        .eq('google_event_id', linked.recurring_event_id)
      return { success: true, data: undefined }
    }

    const { error } = await supabase
      .from(EVENTS_TABLE)
      .delete()
      .eq('id', eventId)
      .eq('user_id', user.id)

    if (error) return { success: false, error: error.message }

    const googleEventId = linked?.google_event_id
    if (googleEventId && !linked?.recurring_event_id) {
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
