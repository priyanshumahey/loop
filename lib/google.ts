import { google, type calendar_v3 } from 'googleapis'

import {
  addCalendarDays,
  calendarDateToUtc,
  dateInTimeZone,
} from '@/lib/recurrence'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  // Read/write access to the user's calendar events so loop can sync both ways.
  'https://www.googleapis.com/auth/calendar.events',
]

// Cookie holding the OAuth CSRF state between /auth/google and its callback.
export const STATE_COOKIE = 'google_oauth_state'

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getAuthUrl(state: string) {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state,
  })
}

export type CalendarTokens = {
  accessToken: string
  refreshToken: string
  expiryDate: number
}

// Present when googleapis silently refreshed the access token; persist it.
export type RefreshedTokens = { accessToken: string; expiryDate: number }

/**
 * A Google Calendar event normalized to loop's internal shape. All times are
 * ISO strings; all-day events use midnight-local boundaries with an INCLUSIVE
 * end (Google's `end.date` is exclusive, so we shift it back one day).
 */
export type GoogleEvent = {
  googleEventId: string
  recurringEventId: string | null
  originalStart: string | null
  recurrence: string[] | null
  etag: string | null
  updated: string | null // RFC3339 last-modification time
  status: string | null // 'confirmed' | 'tentative' | 'cancelled'
  title: string
  description: string | null
  start: string | null
  end: string | null
  allDay: boolean
  location: string | null
  timezone: string | null
}

/** The fields loop pushes to Google when creating/updating an event. */
export type GoogleEventInput = {
  title: string
  description?: string | null
  start: string // ISO
  end: string // ISO
  allDay: boolean
  location?: string | null
  timezone?: string | null
  recurrence?: string[]
}

type Result<T> = T & { refreshed?: RefreshedTokens }

function makeClient(tokens: CalendarTokens) {
  const client = getOAuth2Client()
  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate,
  })

  const captured: { refreshed?: RefreshedTokens } = {}
  client.on('tokens', (t) => {
    if (t.access_token) {
      captured.refreshed = {
        accessToken: t.access_token,
        expiryDate: t.expiry_date ?? Date.now() + 3600 * 1000,
      }
    }
  })

  return { client, captured }
}

function mapGoogleEvent(
  e: calendar_v3.Schema$Event,
  calendarTimeZone = 'UTC'
): GoogleEvent {
  const isAllDay = Boolean(e.start?.date && !e.start?.dateTime)
  const timeZone = e.start?.timeZone ?? e.end?.timeZone ?? calendarTimeZone

  let start: string | null = e.start?.dateTime ?? null
  let end: string | null = e.end?.dateTime ?? null

  if (isAllDay) {
    // Google all-day dates are 'YYYY-MM-DD' with an EXCLUSIVE end date. Convert
    // to local midnight and pull the end back one day so it is inclusive, which
    // is what the calendar UI (isSameDay on end) expects.
    start = e.start?.date
      ? calendarDateToUtc(e.start.date, timeZone).toISOString()
      : null
    end = e.end?.date
      ? calendarDateToUtc(
          addCalendarDays(e.end.date, -1),
          timeZone
        ).toISOString()
      : null
  }

  return {
    googleEventId: e.id ?? '',
    recurringEventId: e.recurringEventId ?? null,
    originalStart:
      e.originalStartTime?.dateTime ?? e.originalStartTime?.date ?? null,
    recurrence: e.recurrence ?? null,
    etag: e.etag ?? null,
    updated: e.updated ?? null,
    status: e.status ?? null,
    title: e.summary ?? '(no title)',
    description: e.description ?? null,
    start,
    end,
    allDay: isAllDay,
    location: e.location ?? null,
    timezone: timeZone,
  }
}

export function googleEventToResource(
  input: GoogleEventInput
): calendar_v3.Schema$Event {
  const base = {
    summary: input.title || '(no title)',
    description: input.description === undefined ? undefined : input.description,
    location: input.location === undefined ? undefined : input.location,
    recurrence: input.recurrence,
  }

  if (input.allDay) {
    const timeZone = input.timezone ?? 'UTC'
    const inclusiveEndDate = dateInTimeZone(new Date(input.end), timeZone)
    const exclusiveEndDate = addCalendarDays(inclusiveEndDate, 1)
    // Convert the inclusive local end back to Google's exclusive end.date.
    return {
      ...base,
      start: {
        date: dateInTimeZone(new Date(input.start), timeZone),
      },
      end: { date: exclusiveEndDate },
    }
  }

  return {
    ...base,
    start: { dateTime: input.start, timeZone: input.timezone ?? undefined },
    end: { dateTime: input.end, timeZone: input.timezone ?? undefined },
  }
}

/**
 * List events from a calendar within a time window. `singleEvents` expands
 * recurring events into individual instances so they render on the grid.
 */
export async function listCalendarEvents(
  tokens: CalendarTokens,
  opts: { timeMin: string; timeMax: string; calendarId?: string }
): Promise<Result<{ events: GoogleEvent[] }>> {
  const { client, captured } = makeClient(tokens)
  const calendar = google.calendar({ version: 'v3', auth: client })

  const events: GoogleEvent[] = []
  let pageToken: string | undefined

  do {
    const res = await calendar.events.list({
      calendarId: opts.calendarId ?? 'primary',
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      singleEvents: true,
      showDeleted: true,
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken,
    })
    for (const item of res.data.items ?? []) {
      events.push(mapGoogleEvent(item, res.data.timeZone ?? 'UTC'))
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return { events, refreshed: captured.refreshed }
}

export async function insertCalendarEvent(
  tokens: CalendarTokens,
  input: GoogleEventInput,
  calendarId = 'primary'
): Promise<Result<{ event: GoogleEvent }>> {
  const { client, captured } = makeClient(tokens)
  const calendar = google.calendar({ version: 'v3', auth: client })

  const res = await calendar.events.insert({
    calendarId,
    requestBody: googleEventToResource(input),
  })

  return {
    event: mapGoogleEvent(res.data, input.timezone ?? 'UTC'),
    refreshed: captured.refreshed,
  }
}

export async function getCalendarEvent(
  tokens: CalendarTokens,
  googleEventId: string,
  calendarId = 'primary',
  calendarTimeZone = 'UTC'
): Promise<Result<{ event: GoogleEvent; resource: calendar_v3.Schema$Event }>> {
  const { client, captured } = makeClient(tokens)
  const calendar = google.calendar({ version: 'v3', auth: client })
  const res = await calendar.events.get({ calendarId, eventId: googleEventId })

  return {
    event: mapGoogleEvent(res.data, calendarTimeZone),
    resource: res.data,
    refreshed: captured.refreshed,
  }
}

export async function patchCalendarEventRecurrence(
  tokens: CalendarTokens,
  googleEventId: string,
  recurrence: string[],
  calendarId = 'primary',
  expectedEtag?: string | null
): Promise<Result<{ etag: string | null }>> {
  const { client, captured } = makeClient(tokens)
  const calendar = google.calendar({ version: 'v3', auth: client })

  const res = await calendar.events.patch(
    {
      calendarId,
      eventId: googleEventId,
      requestBody: { recurrence },
    },
    expectedEtag ? { headers: { 'If-Match': expectedEtag } } : undefined
  )

  return { etag: res.data.etag ?? null, refreshed: captured.refreshed }
}

/** Copy the writable event fields Google expects when splitting a series. */
export function copyCalendarEventResource(
  parent: calendar_v3.Schema$Event,
  input: GoogleEventInput
): calendar_v3.Schema$Event {
  const changed = googleEventToResource(input)

  return {
    summary: changed.summary,
    description: changed.description,
    location: changed.location,
    start: changed.start,
    end: changed.end,
    recurrence: changed.recurrence,
    attendees: parent.attendees,
    reminders: parent.reminders,
    colorId: parent.colorId,
    conferenceData: parent.conferenceData,
    attachments: parent.attachments,
    extendedProperties: parent.extendedProperties,
    transparency: parent.transparency,
    visibility: parent.visibility,
    guestsCanInviteOthers: parent.guestsCanInviteOthers,
    guestsCanModify: parent.guestsCanModify,
    guestsCanSeeOtherGuests: parent.guestsCanSeeOtherGuests,
    anyoneCanAddSelf: parent.anyoneCanAddSelf,
    source: parent.source,
  }
}

export async function insertCalendarEventResource(
  tokens: CalendarTokens,
  resource: calendar_v3.Schema$Event,
  calendarId = 'primary',
  calendarTimeZone = 'UTC'
): Promise<Result<{ event: GoogleEvent }>> {
  const { client, captured } = makeClient(tokens)
  const calendar = google.calendar({ version: 'v3', auth: client })

  const res = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 1,
    supportsAttachments: true,
    requestBody: resource,
  })

  return {
    event: mapGoogleEvent(res.data, calendarTimeZone),
    refreshed: captured.refreshed,
  }
}

export async function patchCalendarEvent(
  tokens: CalendarTokens,
  googleEventId: string,
  input: GoogleEventInput,
  calendarId = 'primary',
  expectedEtag?: string | null
): Promise<Result<{ event: GoogleEvent }>> {
  const { client, captured } = makeClient(tokens)
  const calendar = google.calendar({ version: 'v3', auth: client })

  const res = await calendar.events.patch(
    {
      calendarId,
      eventId: googleEventId,
      requestBody: googleEventToResource(input),
    },
    expectedEtag ? { headers: { 'If-Match': expectedEtag } } : undefined
  )

  return {
    event: mapGoogleEvent(res.data, input.timezone ?? 'UTC'),
    refreshed: captured.refreshed,
  }
}

export async function deleteCalendarEvent(
  tokens: CalendarTokens,
  googleEventId: string,
  calendarId = 'primary'
): Promise<Result<Record<never, never>>> {
  const { client, captured } = makeClient(tokens)
  const calendar = google.calendar({ version: 'v3', auth: client })

  try {
    await calendar.events.delete({ calendarId, eventId: googleEventId })
  } catch (err: unknown) {
    // Already gone on Google's side – treat as success (idempotent delete).
    const status = (err as { code?: number })?.code
    if (status !== 404 && status !== 410) throw err
  }

  return { refreshed: captured.refreshed }
}
