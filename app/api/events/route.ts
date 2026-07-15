import { NextResponse, type NextRequest } from 'next/server'

import type {
  CalendarEvent,
  EventRecurrence,
} from '@/components/event-calendar/types'
import { createEvent, getEvents } from '@/lib/db/events'

function serialize(event: CalendarEvent) {
  return { ...event, start: event.start.toISOString(), end: event.end.toISOString() }
}

function statusFor(error: string): number {
  if (error === 'Unauthorized') return 401
  if (error === 'Event not found') return 404
  return 400
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const limit = searchParams.get('limit')
  const offset = searchParams.get('offset')

  const result = await getEvents({
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: statusFor(result.error) })
  }

  return NextResponse.json({ data: result.data.map(serialize) })
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.start || !body.end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 })
  }

  const event: CalendarEvent = {
    id: (body.id as string) ?? '',
    title: (body.title as string) ?? '(no title)',
    description: body.description as string | undefined,
    start: new Date(body.start as string),
    end: new Date(body.end as string),
    allDay: body.allDay as boolean | undefined,
    color: body.color as CalendarEvent['color'],
    location: body.location as string | undefined,
    timezone: body.timezone as string | undefined,
    recurrence: body.recurrence as EventRecurrence | undefined,
  }

  const result = await createEvent(event)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: statusFor(result.error) })
  }

  return NextResponse.json({ data: serialize(result.data) }, { status: 201 })
}
