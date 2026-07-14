import type { SupabaseClient } from '@supabase/supabase-js'

import { decrypt, encrypt } from '@/lib/encryption'
import {
  deleteCalendarEvent,
  insertCalendarEvent,
  listCalendarEvents,
  patchCalendarEvent,
  type CalendarTokens,
  type GoogleEventInput,
  type RefreshedTokens,
} from '@/lib/google'

const DEFAULT_CALENDAR_ID = 'primary'

type Db = SupabaseClient

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

  const { events: remote, refreshed } = await listCalendarEvents(tokens, {
    timeMin,
    timeMax,
    calendarId: DEFAULT_CALENDAR_ID,
  })
  await saveRefreshed(db, userId, refreshed)

  // Existing rows linked to Google (either pulled from Google or created in
  // loop and pushed up) that overlap this window.
  const { data: existingRows } = await db
    .from('events')
    .select('id, google_event_id, etag')
    .eq('user_id', userId)
    .not('google_event_id', 'is', null)
    .lte('start_time', timeMax)
    .gte('end_time', timeMin)

  const existing = new Map<string, { id: string; etag: string | null }>()
  for (const row of existingRows ?? []) {
    if (row.google_event_id) existing.set(row.google_event_id, { id: row.id, etag: row.etag })
  }

  const seen = new Set<string>()
  let imported = 0
  let updated = 0
  let removed = 0

  for (const ev of remote) {
    if (!ev.googleEventId || !ev.start || !ev.end) continue

    // Cancelled instances of recurring events come back in a windowed list.
    if (ev.status === 'cancelled') {
      const match = existing.get(ev.googleEventId)
      if (match) {
        await db.from('events').delete().eq('id', match.id).eq('user_id', userId)
        removed++
      }
      continue
    }

    seen.add(ev.googleEventId)
    const match = existing.get(ev.googleEventId)

    const payload = {
      title: ev.title,
      description: ev.description,
      start_time: ev.start,
      end_time: ev.end,
      all_day: ev.allDay,
      location: ev.location,
      timezone: ev.timezone,
      etag: ev.etag,
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
    } else if (match.etag !== ev.etag) {
      await db.from('events').update(payload).eq('id', match.id).eq('user_id', userId)
      updated++
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
  input: GoogleEventInput
): Promise<{ etag: string | null } | null> {
  const tokens = await getGoogleTokens(db, userId)
  if (!tokens) return null

  const { event, refreshed } = await patchCalendarEvent(
    tokens,
    googleEventId,
    input,
    DEFAULT_CALENDAR_ID
  )
  await saveRefreshed(db, userId, refreshed)
  return { etag: event.etag }
}

/** Remove a google-linked event from Google (idempotent). */
export async function removeEventFromGoogle(
  db: Db,
  userId: string,
  googleEventId: string
): Promise<void> {
  const tokens = await getGoogleTokens(db, userId)
  if (!tokens) return

  const { refreshed } = await deleteCalendarEvent(tokens, googleEventId, DEFAULT_CALENDAR_ID)
  await saveRefreshed(db, userId, refreshed)
}
