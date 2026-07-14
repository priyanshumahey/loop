import { addDays, format, parseISO } from 'date-fns'
import { google, type calendar_v3 } from 'googleapis'

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
  etag: string | null
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

function mapGoogleEvent(e: calendar_v3.Schema$Event): GoogleEvent {
  const isAllDay = Boolean(e.start?.date && !e.start?.dateTime)

  let start: string | null = e.start?.dateTime ?? null
  let end: string | null = e.end?.dateTime ?? null

  if (isAllDay) {
    // Google all-day dates are 'YYYY-MM-DD' with an EXCLUSIVE end date. Convert
    // to local midnight and pull the end back one day so it is inclusive, which
    // is what the calendar UI (isSameDay on end) expects.
    start = e.start?.date ? `${e.start.date}T00:00:00` : null
    end = e.end?.date
      ? `${format(addDays(parseISO(`${e.end.date}T00:00:00`), -1), 'yyyy-MM-dd')}T00:00:00`
      : null
  }

  return {
    googleEventId: e.id ?? '',
    etag: e.etag ?? null,
    status: e.status ?? null,
    title: e.summary ?? '(no title)',
    description: e.description ?? null,
    start,
    end,
    allDay: isAllDay,
    location: e.location ?? null,
    timezone: e.start?.timeZone ?? e.end?.timeZone ?? null,
  }
}

function toGoogleResource(input: GoogleEventInput): calendar_v3.Schema$Event {
  const base = {
    summary: input.title || '(no title)',
    description: input.description ?? undefined,
    location: input.location ?? undefined,
  }

  if (input.allDay) {
    // Convert the inclusive local end back to Google's exclusive end.date.
    return {
      ...base,
      start: { date: format(parseISO(input.start), 'yyyy-MM-dd') },
      end: { date: format(addDays(parseISO(input.end), 1), 'yyyy-MM-dd') },
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
      orderBy: 'startTime',
      maxResults: 2500,
      pageToken,
    })
    for (const item of res.data.items ?? []) events.push(mapGoogleEvent(item))
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
    requestBody: toGoogleResource(input),
  })

  return { event: mapGoogleEvent(res.data), refreshed: captured.refreshed }
}

export async function patchCalendarEvent(
  tokens: CalendarTokens,
  googleEventId: string,
  input: GoogleEventInput,
  calendarId = 'primary'
): Promise<Result<{ event: GoogleEvent }>> {
  const { client, captured } = makeClient(tokens)
  const calendar = google.calendar({ version: 'v3', auth: client })

  const res = await calendar.events.patch({
    calendarId,
    eventId: googleEventId,
    requestBody: toGoogleResource(input),
  })

  return { event: mapGoogleEvent(res.data), refreshed: captured.refreshed }
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
