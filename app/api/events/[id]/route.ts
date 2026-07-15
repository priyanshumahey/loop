import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import type {
  CalendarEvent,
  RecurrenceScope,
} from '@/components/event-calendar/types'
import { deleteEvent, getEventById, updateEvent } from '@/lib/db/events'

interface RouteParams {
  params: Promise<{ id: string }>
}

const recurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(99).optional(),
  byWeekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  ends: z.enum(['never', 'on', 'after']).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  count: z.number().int().min(1).max(999).optional(),
  readOnly: z.boolean().optional(),
})

function serialize(event: CalendarEvent) {
  return { ...event, start: event.start.toISOString(), end: event.end.toISOString() }
}

function statusFor(error: string): number {
  if (error === 'Unauthorized') return 401
  if (error === 'Event not found') return 404
  return 400
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Event ID is required' }, { status: 400 })

  const result = await getEventById(id)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: statusFor(result.error) })
  }
  return NextResponse.json({ data: serialize(result.data) })
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Event ID is required' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Partial<CalendarEvent> = {}
  if (body.title !== undefined) updates.title = body.title as string
  if (body.description !== undefined) updates.description = body.description as string | undefined
  if (body.start !== undefined) updates.start = new Date(body.start as string)
  if (body.end !== undefined) updates.end = new Date(body.end as string)
  if (body.allDay !== undefined) updates.allDay = body.allDay as boolean
  if (body.color !== undefined) updates.color = body.color as CalendarEvent['color']
  if (body.location !== undefined) updates.location = body.location as string | undefined
  if (body.timezone !== undefined) updates.timezone = body.timezone as string | undefined
  if (body.recurrence !== undefined) {
    const recurrence = recurrenceSchema.safeParse(body.recurrence)
    if (!recurrence.success) {
      return NextResponse.json(
        { error: 'Invalid recurrence rule' },
        { status: 400 }
      )
    }
    updates.recurrence = recurrence.data
  }

  const recurrenceScope: RecurrenceScope =
    body.recurrenceScope === 'series'
      ? 'series'
      : body.recurrenceScope === 'following'
        ? 'following'
        : 'single'
  const result = await updateEvent(id, updates, recurrenceScope)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: statusFor(result.error) })
  }
  return NextResponse.json({ data: serialize(result.data) })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Event ID is required' }, { status: 400 })

  const scopeParam = request.nextUrl.searchParams.get('recurrenceScope')
  const recurrenceScope: RecurrenceScope =
    scopeParam === 'series'
      ? 'series'
      : scopeParam === 'following'
        ? 'following'
        : 'single'
  const result = await deleteEvent(id, recurrenceScope)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: statusFor(result.error) })
  }
  return NextResponse.json({ data: null })
}
