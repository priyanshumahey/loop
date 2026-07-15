import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import { decrypt, encrypt } from '@/lib/encryption'
import {
  copyCalendarEventResource,
  deleteCalendarEvent,
  getCalendarEvent,
  insertCalendarEvent,
  insertCalendarEventResource,
  listCalendarEvents,
  patchCalendarEvent,
  patchCalendarEventRecurrence,
  type CalendarTokens,
  type GoogleEventInput,
  type RefreshedTokens,
} from '@/lib/google'
import {
  calendarDateToUtc,
  googleRuleToRecurrence,
  isFirstRecurrenceOccurrence,
  recurrenceRulesForTail,
  shiftByWallTimeChange,
  trimRecurrenceRules,
} from '@/lib/recurrence'
import type { EventRecurrence } from '@/components/event-calendar/types'

const DEFAULT_CALENDAR_ID = 'primary'
const LOCAL_WRITE_GRACE_MS = 30_000

type Db = SupabaseClient

export function shouldProtectLocalGoogleWrite(
  localUpdatedAt: string | null,
  googleUpdatedAt: string | null,
  now = Date.now()
): boolean {
  if (!localUpdatedAt || !googleUpdatedAt) return false
  const localUpdatedMs = new Date(localUpdatedAt).getTime()
  const googleUpdatedMs = new Date(googleUpdatedAt).getTime()
  return (
    localUpdatedMs > googleUpdatedMs &&
    now - localUpdatedMs >= 0 &&
    now - localUpdatedMs < LOCAL_WRITE_GRACE_MS
  )
}

export function replacementSeriesId(
  recurringEventId: string,
  boundaryOriginalStart: string
): string {
  return createHash('sha256')
    .update(`${recurringEventId}:${boundaryOriginalStart}`)
    .digest('hex')
    .slice(0, 32)
}

/**
 * Load and decrypt the user's stored Google tokens. Returns null when the user
 * has not connected Google (so callers can no-op gracefully).
 */
async function getGoogleTokens(db: Db, userId: string): Promise<CalendarTokens | null> {
  const { data, error } = await db
    .from('oauth_tokens')
    .select('access_token, refresh_token, expiry_date')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle()

  if (error || !data) return null

  try {
    return {
      accessToken: decrypt(data.access_token),
      refreshToken: decrypt(data.refresh_token),
      expiryDate: Number(data.expiry_date),
    }
  } catch {
    return null
  }
}

/** Persist a token that googleapis silently refreshed mid-request. */
async function saveRefreshed(db: Db, userId: string, refreshed?: RefreshedTokens) {
  if (!refreshed) return
  await db
    .from('oauth_tokens')
    .update({
      access_token: encrypt(refreshed.accessToken),
      expiry_date: refreshed.expiryDate,
    })
    .eq('user_id', userId)
    .eq('provider', 'google')
}

export async function isGoogleConnected(db: Db, userId: string): Promise<boolean> {
  return (await getGoogleTokens(db, userId)) !== null
}

/**
 * Pull events from Google for a time window and reconcile them into the local
 * `events` table:
 *   - insert events new to loop,
 *   - update events whose Google etag changed,
 *   - delete local google-sourced rows that no longer exist on Google.
 * Local-only events (google_event_id is null) are never touched.
 */
export async function pullGoogleEvents(
  db: Db,
  userId: string,
  timeMin: string,
  timeMax: string
): Promise<{ synced: boolean; imported: number; updated: number; removed: number }> {
  const tokens = await getGoogleTokens(db, userId)
  if (!tokens) return { synced: false, imported: 0, updated: 0, removed: 0 }
  const googleTokens = tokens

  const { events: remote, refreshed } = await listCalendarEvents(googleTokens, {
    timeMin,
    timeMax,
    calendarId: DEFAULT_CALENDAR_ID,
  })
  await saveRefreshed(db, userId, refreshed)

  // Existing rows linked to Google (either pulled from Google or created in
  // loop and pushed up) that overlap this window.
  const { data: existingRows } = await db
    .from('events')
    .select('id, google_event_id, etag, recurring_event_id, original_start_time, recurrence, updated_at')
    .eq('user_id', userId)
    .not('google_event_id', 'is', null)
    .lt('start_time', timeMax)
    .gt('end_time', timeMin)

  const existing = new Map<
    string,
    {
      id: string
      etag: string | null
      recurringEventId: string | null
      originalStart: string | null
      recurrence: EventRecurrence | null
      updatedAt: string | null
    }
  >()
  for (const row of existingRows ?? []) {
    if (row.google_event_id) {
      existing.set(row.google_event_id, {
        id: row.id,
        etag: row.etag,
        recurringEventId: row.recurring_event_id,
        originalStart: row.original_start_time,
        recurrence: row.recurrence,
        updatedAt: row.updated_at,
      })
    }
  }

  // The recurrence rule lives on the series parent, not its instances, so
  // resolve each parent once per pull (cached) and stamp its rule on every
  // occurrence.
  const seriesRules = new Map<
    string,
    EventRecurrence | null | undefined
  >()
  async function resolveSeriesRule(
    parentId: string,
    timeZone: string
  ): Promise<EventRecurrence | null | undefined> {
    if (seriesRules.has(parentId)) return seriesRules.get(parentId)
    try {
      const { event, refreshed: got } = await getCalendarEvent(
        googleTokens,
        parentId,
        DEFAULT_CALENDAR_ID,
        timeZone
      )
      await saveRefreshed(db, userId, got)
      const rule = googleRuleToRecurrence(event.recurrence, event.timezone ?? timeZone)
      seriesRules.set(parentId, rule)
      return rule
    } catch {
      seriesRules.set(parentId, undefined)
      return undefined
    }
  }

  const seen = new Set<string>()
  let imported = 0
  let updated = 0
  let removed = 0

  for (const ev of remote) {
    if (!ev.googleEventId) continue

    if (ev.status === 'cancelled') {
      const match = existing.get(ev.googleEventId)
      if (match) {
        await db.from('events').delete().eq('id', match.id).eq('user_id', userId)
        existing.delete(ev.googleEventId)
        removed++
      }
      continue
    }
    if (!ev.start || !ev.end) continue

    seen.add(ev.googleEventId)
    const match = existing.get(ev.googleEventId)

    const resolvedRecurrence = ev.recurringEventId
      ? await resolveSeriesRule(ev.recurringEventId, ev.timezone ?? 'UTC')
      : null
    const recurrence =
      resolvedRecurrence === undefined
        ? match?.recurrence ?? null
        : resolvedRecurrence

    const payload = {
      title: ev.title,
      description: ev.description,
      start_time: ev.start,
      end_time: ev.end,
      all_day: ev.allDay,
      location: ev.location,
      timezone: ev.timezone,
      etag: ev.etag,
      recurring_event_id: ev.recurringEventId,
      original_start_time: ev.originalStart,
      recurrence,
    }

    if (!match) {
      await db.from('events').insert({
        user_id: userId,
        source: 'google',
        google_event_id: ev.googleEventId,
        google_calendar_id: DEFAULT_CALENDAR_ID,
        ...payload,
      })
      imported++
    } else if (
      match.etag !== ev.etag ||
      match.recurringEventId !== ev.recurringEventId ||
      match.originalStart !== ev.originalStart ||
      JSON.stringify(match.recurrence) !== JSON.stringify(recurrence)
    ) {
      // Last-writer-wins: Google is eventually consistent, so a pull right
      // after a patch can still return the pre-edit copy — don't revert a
      // locally newer edit.
      const protectLocal = shouldProtectLocalGoogleWrite(
        match.updatedAt,
        ev.updated
      )
      if (!protectLocal) {
        await db.from('events').update(payload).eq('id', match.id).eq('user_id', userId)
        updated++
      }
    }
  }

  // Anything we had locally but Google no longer returned was deleted remotely.
  const stale = [...existing.entries()]
    .filter(([gid]) => !seen.has(gid))
    .map(([, v]) => v.id)
  if (stale.length > 0) {
    await db.from('events').delete().in('id', stale).eq('user_id', userId)
    removed += stale.length
  }

  return { synced: true, imported, updated, removed }
}

/**
 * Push a newly-created loop event up to Google. Returns the Google linkage to
 * store on the local row, or null if the user is not connected.
 */
export async function pushEventToGoogle(
  db: Db,
  userId: string,
  input: GoogleEventInput
): Promise<{ googleEventId: string; etag: string | null } | null> {
  const tokens = await getGoogleTokens(db, userId)
  if (!tokens) return null

  const { event, refreshed } = await insertCalendarEvent(tokens, input, DEFAULT_CALENDAR_ID)
  await saveRefreshed(db, userId, refreshed)
  return { googleEventId: event.googleEventId, etag: event.etag }
}

/** Push an update for an existing google-linked event. Returns the new etag. */
export async function patchEventOnGoogle(
  db: Db,
  userId: string,
  googleEventId: string,
  input: GoogleEventInput,
  expectedEtag?: string | null
): Promise<{ etag: string | null } | null> {
  const tokens = await getGoogleTokens(db, userId)
  if (!tokens) return null

  const { event, refreshed } = await patchCalendarEvent(
    tokens,
    googleEventId,
    input,
    DEFAULT_CALENDAR_ID,
    expectedEtag
  )
  await saveRefreshed(db, userId, refreshed)
  return { etag: event.etag }
}

type SeriesField =
  | 'title'
  | 'description'
  | 'start'
  | 'end'
  | 'allDay'
  | 'location'
  | 'timezone'

export async function patchEventSeriesOnGoogle(
  db: Db,
  userId: string,
  recurringEventId: string,
  before: GoogleEventInput,
  after: GoogleEventInput,
  changedFields: Set<SeriesField>,
  newRecurrence?: string[],
  selectedOriginalStart?: string | null
): Promise<boolean> {
  const tokens = await getGoogleTokens(db, userId)
  if (!tokens) return false

  const { event: parent, refreshed: refreshedByGet } = await getCalendarEvent(
    tokens,
    recurringEventId,
    DEFAULT_CALENDAR_ID,
    after.timezone ?? before.timezone ?? 'UTC'
  )
  await saveRefreshed(db, userId, refreshedByGet)
  if (!parent.start || !parent.end) throw new Error('Recurring event has no date range')

  const timeZone = after.timezone ?? before.timezone ?? parent.timezone ?? 'UTC'
  const series: GoogleEventInput = {
    title: parent.title,
    description: parent.description,
    start: parent.start,
    end: parent.end,
    allDay: parent.allDay,
    location: parent.location,
    timezone: parent.timezone ?? timeZone,
    recurrence: newRecurrence ?? parent.recurrence ?? undefined,
  }

  if (changedFields.has('title')) series.title = after.title
  if (changedFields.has('description')) series.description = after.description
  if (changedFields.has('location')) series.location = after.location
  if (changedFields.has('timezone')) series.timezone = after.timezone
  if (changedFields.has('allDay')) series.allDay = after.allDay
  const scheduledStart = selectedOriginalStart
    ? /^\d{4}-\d{2}-\d{2}$/.test(selectedOriginalStart)
      ? calendarDateToUtc(selectedOriginalStart, timeZone)
      : new Date(selectedOriginalStart)
    : new Date(before.start)
  if (changedFields.has('start') || changedFields.has('allDay')) {
    series.start = shiftByWallTimeChange(
      new Date(parent.start),
      scheduledStart,
      new Date(after.start),
      timeZone
    ).toISOString()
  }
  if (changedFields.has('end') || changedFields.has('allDay')) {
    const parentDuration =
      new Date(parent.end).getTime() - new Date(parent.start).getTime()
    const scheduledEnd = new Date(scheduledStart.getTime() + parentDuration)
    series.end = shiftByWallTimeChange(
      new Date(parent.end),
      scheduledEnd,
      new Date(after.end),
      timeZone
    ).toISOString()
  }

  const { refreshed } = await patchCalendarEvent(
    tokens,
    recurringEventId,
    series,
    DEFAULT_CALENDAR_ID,
    parent.etag
  )
  await saveRefreshed(db, userId, refreshed)
  return true
}

/**
 * Split a recurring series at `boundaryOriginalStart` (the scheduled start of
 * the first affected occurrence). Google models "this and following" as two
 * operations: trim the original series to end before the boundary, then
 * optionally create a fresh series from the boundary onward carrying any edit.
 *
 * Returns the new series' Google id (null when only trimming, e.g. a "this and
 * following" delete), or null overall when the user isn't connected.
 */
export async function splitEventSeriesOnGoogle(
  db: Db,
  userId: string,
  recurringEventId: string,
  boundaryOriginalStart: string,
  options: {
    timeZone?: string
    edit?: { after: GoogleEventInput; changedFields: Set<SeriesField> }
  }
): Promise<{
  newSeriesGoogleId: string | null
  reusedOriginalSeries: boolean
} | null> {
  const tokens = await getGoogleTokens(db, userId)
  if (!tokens) return null

  const timeZone = options.edit?.after.timezone ?? options.timeZone ?? 'UTC'
  const {
    event: parent,
    resource: parentResource,
    refreshed: refreshedByGet,
  } = await getCalendarEvent(
    tokens,
    recurringEventId,
    DEFAULT_CALENDAR_ID,
    timeZone
  )
  await saveRefreshed(db, userId, refreshedByGet)
  if (!parent.start || !parent.end) throw new Error('Recurring event has no date range')
  if (!parent.recurrence || parent.recurrence.length === 0) {
    throw new Error('Event is not a recurring series')
  }
  if (parentResource.locked || (parentResource.eventType ?? 'default') !== 'default') {
    throw new Error(
      'This and following is not supported for locked or specialized calendar events'
    )
  }

  const parentTimeZone = parent.timezone ?? timeZone
  if (
    isFirstRecurrenceOccurrence(parent.start, boundaryOriginalStart, {
      allDay: parent.allDay,
      timeZone: parentTimeZone,
    })
  ) {
    if (!options.edit) {
      const { refreshed } = await deleteCalendarEvent(
        tokens,
        recurringEventId,
        DEFAULT_CALENDAR_ID
      )
      await saveRefreshed(db, userId, refreshed)
      return { newSeriesGoogleId: null, reusedOriginalSeries: true }
    }

    const { after, changedFields } = options.edit
    const updated: GoogleEventInput = {
      title: changedFields.has('title') ? after.title : parent.title,
      description: changedFields.has('description')
        ? after.description
        : parent.description,
      location: changedFields.has('location') ? after.location : parent.location,
      start: changedFields.has('start') ? after.start : parent.start,
      end: changedFields.has('end') ? after.end : parent.end,
      allDay: changedFields.has('allDay') ? after.allDay : parent.allDay,
      timezone: changedFields.has('timezone')
        ? after.timezone
        : parentTimeZone,
      recurrence: parent.recurrence,
    }
    const { refreshed } = await patchCalendarEvent(
      tokens,
      recurringEventId,
      updated,
      DEFAULT_CALENDAR_ID,
      parent.etag
    )
    await saveRefreshed(db, userId, refreshed)
    return {
      newSeriesGoogleId: recurringEventId,
      reusedOriginalSeries: true,
    }
  }
  if (
    parent.recurrence.length !== 1 ||
    !parent.recurrence[0]?.toUpperCase().startsWith('RRULE')
  ) {
    throw new Error(
      'This and following is not supported for custom multi-line recurrence rules'
    )
  }

  // 1. Trim the original series so it stops before the boundary occurrence.
  const trimmedRecurrence = trimRecurrenceRules(
    parent.recurrence,
    boundaryOriginalStart,
    parent.allDay
  )
  const tailRecurrence = recurrenceRulesForTail(
    parent.recurrence,
    parent.start,
    boundaryOriginalStart,
    { allDay: parent.allDay, timeZone: parent.timezone ?? timeZone }
  )
  const {
    etag: trimmedEtag,
    refreshed: refreshedByTrim,
  } = await patchCalendarEventRecurrence(
    tokens,
    recurringEventId,
    trimmedRecurrence,
    DEFAULT_CALENDAR_ID,
    parent.etag
  )
  await saveRefreshed(db, userId, refreshedByTrim)

  // 2. Optionally start a fresh series at the boundary carrying the edit.
  let newSeriesGoogleId: string | null = null
  if (options.edit) {
    const { after, changedFields } = options.edit
    const newSeries: GoogleEventInput = {
      title: changedFields.has('title') ? after.title : parent.title,
      description: changedFields.has('description')
        ? after.description
        : parent.description,
      location: changedFields.has('location') ? after.location : parent.location,
      allDay: changedFields.has('allDay') ? after.allDay : parent.allDay,
      timezone: changedFields.has('timezone')
        ? after.timezone
        : parent.timezone ?? timeZone,
      start: after.start,
      end: after.end,
      recurrence: tailRecurrence,
    }
    const newSeriesId = replacementSeriesId(
      recurringEventId,
      boundaryOriginalStart
    )
    try {
      const resource = copyCalendarEventResource(parentResource, newSeries)
      resource.id = newSeriesId
      const { event, refreshed: refreshedByInsert } =
        await insertCalendarEventResource(
          tokens,
          resource,
          DEFAULT_CALENDAR_ID,
          newSeries.timezone ?? timeZone
        )
      await saveRefreshed(db, userId, refreshedByInsert)
      newSeriesGoogleId = event.googleEventId
    } catch (insertError) {
      try {
        const { event, refreshed: refreshedByVerification } =
          await getCalendarEvent(
            tokens,
            newSeriesId,
            DEFAULT_CALENDAR_ID,
            newSeries.timezone ?? timeZone
          )
        await saveRefreshed(db, userId, refreshedByVerification)
        const { refreshed: refreshedByReconcile } = await patchCalendarEvent(
          tokens,
          newSeriesId,
          newSeries,
          DEFAULT_CALENDAR_ID,
          event.etag
        )
        await saveRefreshed(db, userId, refreshedByReconcile)
        newSeriesGoogleId = event.googleEventId
      } catch (verificationError) {
        const status = (verificationError as { code?: number }).code
        if (status !== 404 && status !== 410) {
          throw new AggregateError(
            [insertError, verificationError],
            'Could not verify whether the replacement series was created'
          )
        }

        try {
          await patchCalendarEventRecurrence(
            tokens,
            recurringEventId,
            parent.recurrence,
            DEFAULT_CALENDAR_ID,
            trimmedEtag
          )
        } catch (rollbackError) {
          throw new AggregateError(
            [insertError, rollbackError],
            'Failed to create the replacement series and restore the original series'
          )
        }
        throw insertError
      }
    }
  }

  return { newSeriesGoogleId, reusedOriginalSeries: false }
}

/** Remove a google-linked event from Google (idempotent). */
export async function removeEventFromGoogle(
  db: Db,
  userId: string,
  googleEventId: string
): Promise<boolean> {
  const tokens = await getGoogleTokens(db, userId)
  if (!tokens) return false

  const { refreshed } = await deleteCalendarEvent(tokens, googleEventId, DEFAULT_CALENDAR_ID)
  await saveRefreshed(db, userId, refreshed)
  return true
}
