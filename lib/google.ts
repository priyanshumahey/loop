import { google, type calendar_v3, type gmail_v1 } from 'googleapis'

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

export type BookingGoogleEventInput = {
  bookingUid: string
  eventId: string
  calendarId: string
  title: string
  description?: string | null
  start: string
  end: string
  timezone: string
  location?: string | null
  attendees: { email: string; displayName?: string | null }[]
  createGoogleMeet: boolean
  conferenceRequestId: string
}

export type BookingGoogleEvent = {
  eventId: string
  etag: string | null
  htmlLink: string | null
  meetingUrl: string | null
  conferenceId: string | null
  conferenceStatus: string | null
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

function googleHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = error as {
    code?: unknown
    response?: { status?: unknown }
    cause?: unknown
  }
  if (typeof value.code === 'number') return value.code
  if (typeof value.response?.status === 'number') return value.response.status
  return googleHttpStatus(value.cause)
}

function bookingGoogleEvent(
  resource: calendar_v3.Schema$Event,
  fallbackEventId: string
): BookingGoogleEvent {
  const videoEntry = resource.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === 'video'
  )
  return {
    eventId: resource.id ?? fallbackEventId,
    etag: resource.etag ?? null,
    htmlLink: resource.htmlLink ?? null,
    meetingUrl: resource.hangoutLink ?? videoEntry?.uri ?? null,
    conferenceId: resource.conferenceData?.conferenceId ?? null,
    conferenceStatus:
      resource.conferenceData?.createRequest?.status?.statusCode ?? null,
  }
}

/**
 * Create a booking event exactly once. The caller-supplied Google event id is
 * stable across retries, so a lost response cannot produce a second invite.
 */
export async function upsertBookingCalendarEvent(
  tokens: CalendarTokens,
  input: BookingGoogleEventInput
): Promise<Result<{ event: BookingGoogleEvent }>> {
  const { client, captured } = makeClient(tokens)
  const calendar = google.calendar({ version: 'v3', auth: client })

  const getExisting = () =>
    calendar.events.get({
      calendarId: input.calendarId,
      eventId: input.eventId,
    })

  let resource: calendar_v3.Schema$Event
  try {
    resource = (await getExisting()).data
  } catch (error) {
    if (googleHttpStatus(error) !== 404) throw error

    const requestBody: calendar_v3.Schema$Event = {
      id: input.eventId,
      summary: input.title,
      description: input.description ?? undefined,
      location: input.createGoogleMeet
        ? undefined
        : input.location ?? undefined,
      start: { dateTime: input.start, timeZone: input.timezone },
      end: { dateTime: input.end, timeZone: input.timezone },
      attendees: input.attendees.map((attendee) => ({
        email: attendee.email,
        displayName: attendee.displayName ?? undefined,
        responseStatus: 'needsAction',
      })),
      guestsCanInviteOthers: false,
      extendedProperties: {
        private: { loopBookingUid: input.bookingUid },
      },
      conferenceData: input.createGoogleMeet
        ? {
          createRequest: {
            requestId: input.conferenceRequestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        }
        : undefined,
    }

    try {
      resource = (
        await calendar.events.insert({
          calendarId: input.calendarId,
          conferenceDataVersion: 1,
          sendUpdates: 'all',
          requestBody,
        })
      ).data
    } catch (insertError) {
      if (googleHttpStatus(insertError) !== 409) throw insertError
      resource = (await getExisting()).data
    }
  }

  const conferenceState =
    resource.conferenceData?.createRequest?.status?.statusCode
  if (
    input.createGoogleMeet &&
    (!resource.conferenceData || conferenceState === 'failure')
  ) {
    resource = (
      await calendar.events.patch({
        calendarId: input.calendarId,
        eventId: input.eventId,
        conferenceDataVersion: 1,
        sendUpdates: 'none',
        requestBody: {
          conferenceData: {
            createRequest: {
              requestId: input.conferenceRequestId,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
      })
    ).data
  }

  return {
    event: bookingGoogleEvent(resource, input.eventId),
    refreshed: captured.refreshed,
  }
}

/** Move an existing booking event while preserving its provider identity. */
export async function rescheduleBookingCalendarEvent(
  tokens: CalendarTokens,
  input: BookingGoogleEventInput
): Promise<Result<{ event: BookingGoogleEvent }>> {
  const { client, captured } = makeClient(tokens)
  const calendar = google.calendar({ version: 'v3', auth: client })

  let existing: calendar_v3.Schema$Event
  try {
    existing = (
      await calendar.events.get({
        calendarId: input.calendarId,
        eventId: input.eventId,
      })
    ).data
  } catch (error) {
    if (googleHttpStatus(error) !== 404) throw error
    return upsertBookingCalendarEvent(tokens, input)
  }

  const existingConferenceState =
    existing.conferenceData?.createRequest?.status?.statusCode
  const resource = (
    await calendar.events.patch({
      calendarId: input.calendarId,
      eventId: input.eventId,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: {
        summary: input.title,
        description: input.description ?? undefined,
        location: input.createGoogleMeet
          ? undefined
          : input.location ?? undefined,
        start: { dateTime: input.start, timeZone: input.timezone },
        end: { dateTime: input.end, timeZone: input.timezone },
        attendees: input.attendees.map((attendee) => ({
          email: attendee.email,
          displayName: attendee.displayName ?? undefined,
          responseStatus: 'needsAction',
        })),
        guestsCanInviteOthers: false,
        extendedProperties: {
          private: { loopBookingUid: input.bookingUid },
        },
        conferenceData:
          input.createGoogleMeet &&
            (!existing.conferenceData || existingConferenceState === 'failure')
            ? {
              createRequest: {
                requestId: input.conferenceRequestId,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            }
            : undefined,
      },
    })
  ).data

  return {
    event: bookingGoogleEvent(resource, input.eventId),
    refreshed: captured.refreshed,
  }
}

/** Delete a booking event and notify guests; retries treat an absent event as done. */
export async function deleteBookingCalendarEvent(
  tokens: CalendarTokens,
  calendarId: string,
  eventId: string
): Promise<Result<Record<never, never>>> {
  const { client, captured } = makeClient(tokens)
  const calendar = google.calendar({ version: 'v3', auth: client })

  try {
    await calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates: 'all',
    })
  } catch (error) {
    const status = googleHttpStatus(error)
    if (status !== 404 && status !== 410) throw error
  }

  return { refreshed: captured.refreshed }
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

function googleEventToResource(
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

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------

/** A file attached to a Gmail message. */
export type GmailAttachment = {
  attachmentId: string
  filename: string
  mimeType: string
  /** Size in bytes (as reported by Gmail). */
  size: number
  /** True for images/parts referenced inline in the HTML body (Content-ID). */
  inline: boolean
  /** The `Content-ID` (angle brackets stripped) used by `cid:` refs in HTML. */
  contentId: string
}

/** A Gmail message normalized to loop's internal shape. */
export type GmailMessage = {
  id: string
  threadId: string
  from: string
  to: string
  cc: string
  subject: string
  /** RFC 2822 `Date` header as sent by the provider. */
  date: string
  snippet: string
  /** Plain-text body. Empty in list results; populated by getGmailMessage. */
  bodyText: string
  /** HTML body. Empty in list results; populated by getGmailMessage. */
  bodyHtml: string
  /** Attachments. Empty in list results; populated by getGmailMessage. */
  attachments: GmailAttachment[]
  labels: string[]
  unread: boolean
  /** True when the message (or thread) carries a real (non-inline) attachment. */
  hasAttachments: boolean
  /** Number of messages in the thread. 1 for a single message; set by list. */
  messageCount: number
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  const match = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())
  return match?.value ?? ''
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
}

/**
 * Decode HTML entities in text that arrives HTML-escaped (notably Gmail message
 * snippets, e.g. `you&#39;d` → `you'd`). Handles named + numeric (decimal/hex).
 */
function decodeHtmlEntities(input: string): string {
  if (!input.includes('&')) return input
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, code: string) => {
    if (code[0] === '#') {
      const isHex = code[1] === 'x' || code[1] === 'X'
      const num = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return Number.isNaN(num) ? match : String.fromCodePoint(num)
    }
    return NAMED_ENTITIES[code] ?? match
  })
}

/**
 * Recursively walk a Gmail MIME payload collecting the plain-text body, the
 * HTML body, and any attachments (files with a filename + attachmentId).
 */
function parseGmailPayload(payload: gmail_v1.Schema$MessagePart | undefined): {
  text: string
  html: string
  attachments: GmailAttachment[]
} {
  let text = ''
  let html = ''
  const attachments: GmailAttachment[] = []

  function walk(part: gmail_v1.Schema$MessagePart | undefined) {
    if (!part) return

    const filename = part.filename ?? ''
    const attachmentId = part.body?.attachmentId ?? ''

    if (filename && attachmentId) {
      const disposition = getHeader(part.headers, 'Content-Disposition')
      const contentId = getHeader(part.headers, 'Content-ID').replace(/^<|>$/g, '')
      attachments.push({
        attachmentId,
        filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body?.size ?? 0,
        inline:
          Boolean(contentId) || disposition.toLowerCase().startsWith('inline'),
        contentId,
      })
    } else if (part.body?.data) {
      if (part.mimeType === 'text/plain' && !text) {
        text = Buffer.from(part.body.data, 'base64url').toString('utf-8')
      } else if (part.mimeType === 'text/html' && !html) {
        html = Buffer.from(part.body.data, 'base64url').toString('utf-8')
      }
    }

    for (const sub of part.parts ?? []) walk(sub)
  }

  walk(payload)
  return { text, html, attachments }
}

function mapGmailMessage(msg: gmail_v1.Schema$Message): GmailMessage {
  const headers = msg.payload?.headers
  const labels = msg.labelIds ?? []
  const { text, html, attachments } = parseGmailPayload(msg.payload ?? undefined)

  // In `metadata` list results the MIME parts aren't returned, so fall back to
  // the top-level Content-Type: `multipart/mixed` reliably signals a real
  // (non-inline) attachment, whereas `multipart/related`/`alternative` do not.
  const hasAttachments =
    attachments.some((a) => !a.inline) ||
    /multipart\/mixed/i.test(getHeader(headers, 'Content-Type'))

  return {
    id: msg.id ?? '',
    threadId: msg.threadId ?? '',
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    cc: getHeader(headers, 'Cc'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    snippet: decodeHtmlEntities(msg.snippet ?? ''),
    bodyText: text,
    bodyHtml: html,
    attachments,
    labels,
    unread: labels.includes('UNREAD'),
    hasAttachments,
    messageCount: 1,
  }
}

/**
 * Collapse a Gmail thread into a single list row: the newest message's headers
 * and snippet, the thread subject (from the first message), a union of labels,
 * unread if any message is unread, and the message count.
 */
function summarizeThread(thread: gmail_v1.Schema$Thread): GmailMessage {
  const msgs = (thread.messages ?? []).map(mapGmailMessage)
  const newest = msgs[msgs.length - 1]
  if (!newest) {
    return {
      id: '',
      threadId: thread.id ?? '',
      from: '',
      to: '',
      cc: '',
      subject: '',
      date: '',
      snippet: '',
      bodyText: '',
      bodyHtml: '',
      attachments: [],
      labels: [],
      unread: false,
      hasAttachments: false,
      messageCount: 0,
    }
  }

  return {
    ...newest,
    threadId: thread.id ?? newest.threadId,
    // Prefer the original (first) message's subject so replies don't show "Re:".
    subject: msgs[0].subject || newest.subject,
    labels: Array.from(new Set(msgs.flatMap((m) => m.labels))),
    unread: msgs.some((m) => m.unread),
    hasAttachments: msgs.some((m) => m.hasAttachments),
    messageCount: msgs.length,
  }
}

/**
 * List the most recent conversations in the user's inbox, one row per thread.
 * Returns lightweight summaries (headers + snippet, no body) so the list view
 * stays cheap.
 */
export async function listGmailMessages(
  tokens: CalendarTokens,
  opts: {
    maxResults?: number
    query?: string
    pageToken?: string
    includeAllMail?: boolean
  } = {}
): Promise<Result<{ messages: GmailMessage[]; nextPageToken: string | null }>> {
  const { client, captured } = makeClient(tokens)
  const gmail = google.gmail({ version: 'v1', auth: client })

  const listRes = await gmail.users.threads.list({
    userId: 'me',
    // Scope to the inbox by default (the mail view's folder tabs); when the user
    // is searching, drop the label filter so archived/sent/all-mail matches are
    // found too (Gmail still excludes Spam and Trash unless asked).
    labelIds: opts.includeAllMail ? undefined : ['INBOX'],
    q: opts.query || undefined,
    maxResults: Math.min(opts.maxResults ?? 20, 100),
    pageToken: opts.pageToken || undefined,
  })

  const ids = (listRes.data.threads ?? [])
    .map((t) => t.id)
    .filter((id): id is string => Boolean(id))

  // Fetch metadata (headers + snippet) for each thread in parallel and collapse
  // it into a single summary row.
  const messages = await Promise.all(
    ids.map(async (id) => {
      const res = await gmail.users.threads.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'Content-Type'],
      })
      return summarizeThread(res.data)
    })
  )

  return {
    messages,
    nextPageToken: listRes.data.nextPageToken ?? null,
    refreshed: captured.refreshed,
  }
}

/** Fetch a single message in full, including the parsed text/HTML body. */
export async function getGmailMessage(
  tokens: CalendarTokens,
  messageId: string
): Promise<Result<{ message: GmailMessage }>> {
  const { client, captured } = makeClient(tokens)
  const gmail = google.gmail({ version: 'v1', auth: client })

  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })

  return { message: mapGmailMessage(res.data), refreshed: captured.refreshed }
}

/**
 * Fetch every message in a conversation thread, each parsed in full (body
 * included) and ordered oldest → newest as Gmail returns them.
 */
export async function getGmailThread(
  tokens: CalendarTokens,
  threadId: string
): Promise<Result<{ messages: GmailMessage[] }>> {
  const { client, captured } = makeClient(tokens)
  const gmail = google.gmail({ version: 'v1', auth: client })

  const res = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  })

  const messages = (res.data.messages ?? []).map(mapGmailMessage)
  return { messages, refreshed: captured.refreshed }
}

/** Download a single attachment's bytes (returned as base64url) by id. */
export async function getGmailAttachment(
  tokens: CalendarTokens,
  messageId: string,
  attachmentId: string
): Promise<Result<{ data: string; size: number }>> {
  const { client, captured } = makeClient(tokens)
  const gmail = google.gmail({ version: 'v1', auth: client })

  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  })

  return {
    data: res.data.data ?? '',
    size: res.data.size ?? 0,
    refreshed: captured.refreshed,
  }
}
