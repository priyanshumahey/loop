import { google } from 'googleapis'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
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

export type CalendarEvent = {
  id: string
  summary: string
  start: string | null
  end: string | null
  allDay: boolean
  location: string | null
  htmlLink: string | null
}

export type CalendarTokens = {
  accessToken: string
  refreshToken: string
  expiryDate: number
}

export type CalendarResult = {
  events: CalendarEvent[]
  // Present when googleapis silently refreshed the access token; persist it.
  refreshed?: { accessToken: string; expiryDate: number }
}

/**
 * Fetches the signed-in user's events for the current day from their primary
 * Google Calendar. If the access token was expired, googleapis transparently
 * refreshes it using the refresh token and the new token is returned so the
 * caller can persist it.
 */
export async function getTodaysCalendarEvents(tokens: CalendarTokens): Promise<CalendarResult> {
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiryDate,
  })

  let refreshed: CalendarResult['refreshed']
  oauth2Client.on('tokens', (t) => {
    if (t.access_token) {
      refreshed = {
        accessToken: t.access_token,
        expiryDate: t.expiry_date ?? Date.now() + 3600 * 1000,
      }
    }
  })

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  const events: CalendarEvent[] = (res.data.items ?? []).map((e) => ({
    id: e.id ?? '',
    summary: e.summary ?? '(no title)',
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    allDay: Boolean(e.start?.date && !e.start?.dateTime),
    location: e.location ?? null,
    htmlLink: e.htmlLink ?? null,
  }))

  return { events, refreshed }
}
