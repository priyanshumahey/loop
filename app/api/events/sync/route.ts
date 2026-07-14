import { NextResponse, type NextRequest } from 'next/server'

import type { CalendarEvent } from '@/components/event-calendar/types'
import { getEvents } from '@/lib/db/events'
import { pullGoogleEvents } from '@/lib/google-sync'
import { createClient } from '@/lib/supabase/server'

function serialize(event: CalendarEvent) {
  return { ...event, start: event.start.toISOString(), end: event.end.toISOString() }
}

/**
 * POST /api/events/sync
 * Pulls the user's Google Calendar events for a time window into the local
 * store (insert/update/delete reconcile), then returns the fresh event list
 * for that window. No-ops gracefully when Google isn't connected.
 *
 * Body: { startDate: ISO, endDate: ISO }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { startDate?: string; endDate?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.startDate || !body.endDate) {
    return NextResponse.json(
      { error: 'startDate and endDate are required' },
      { status: 400 }
    )
  }

  const startDate = new Date(body.startDate)
  const endDate = new Date(body.endDate)

  let stats = { synced: false, imported: 0, updated: 0, removed: 0 }
  try {
    stats = await pullGoogleEvents(
      supabase,
      user.id,
      startDate.toISOString(),
      endDate.toISOString()
    )
  } catch (err) {
    // Google may be down/unauthorized – still return the local events.
    console.error('Google pull failed:', err)
  }

  const result = await getEvents({ startDate, endDate })
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    data: result.data.map(serialize),
    connected: stats.synced,
    stats,
  })
}
