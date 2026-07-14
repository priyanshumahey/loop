import type { CalendarEvent } from '@/components/event-calendar/types'

const API_BASE = '/api/events'

interface ApiResponse<T> {
  data?: T
  error?: string
}

type SerializedEvent = Record<string, unknown>

function serializeEvent(event: CalendarEvent): SerializedEvent {
  return { ...event, start: event.start.toISOString(), end: event.end.toISOString() }
}

function deserializeEvent(data: SerializedEvent): CalendarEvent {
  return {
    id: data.id as string,
    title: data.title as string,
    description: data.description as string | undefined,
    start: new Date(data.start as string),
    end: new Date(data.end as string),
    allDay: data.allDay as boolean | undefined,
    color: data.color as CalendarEvent['color'],
    location: data.location as string | undefined,
    timezone: data.timezone as string | undefined,
  }
}

/**
 * Pull Google events for a window and return the reconciled local events.
 * `connected` is false when the user has not linked Google.
 */
export async function syncEvents(params: {
  startDate: Date
  endDate: Date
}): Promise<{ events: CalendarEvent[]; connected: boolean }> {
  const response = await fetch(`${API_BASE}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
    }),
  })

  if (!response.ok) {
    const error: ApiResponse<never> = await response.json()
    throw new Error(error.error || 'Failed to sync events')
  }

  const result: ApiResponse<SerializedEvent[]> & { connected?: boolean } =
    await response.json()
  return {
    events: (result.data || []).map(deserializeEvent),
    connected: Boolean(result.connected),
  }
}

export async function createEvent(
  event: Omit<CalendarEvent, 'id'> & { id?: string }
): Promise<CalendarEvent> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serializeEvent(event as CalendarEvent)),
  })

  if (!response.ok) {
    const error: ApiResponse<never> = await response.json()
    throw new Error(error.error || 'Failed to create event')
  }

  const result: ApiResponse<SerializedEvent> = await response.json()
  return deserializeEvent(result.data!)
}

export async function updateEvent(
  eventId: string,
  event: Partial<CalendarEvent>
): Promise<CalendarEvent> {
  const body: SerializedEvent = { ...event }
  if (event.start) body.start = event.start.toISOString()
  if (event.end) body.end = event.end.toISOString()

  const response = await fetch(`${API_BASE}/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error: ApiResponse<never> = await response.json()
    throw new Error(error.error || 'Failed to update event')
  }

  const result: ApiResponse<SerializedEvent> = await response.json()
  return deserializeEvent(result.data!)
}

export async function deleteEvent(eventId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${eventId}`, { method: 'DELETE' })
  if (!response.ok) {
    const error: ApiResponse<never> = await response.json()
    throw new Error(error.error || 'Failed to delete event')
  }
}
