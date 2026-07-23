import { NextResponse, type NextRequest } from 'next/server'

import { getInboxEmail } from '@/lib/google-sync'
import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/emails/[id]
 * Fetches a single Gmail message in full, including the parsed body.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Email ID is required' }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { connected, message } = await getInboxEmail(supabase, user.id, id)
    if (!connected) {
      return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
    }
    if (!message) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }
    return NextResponse.json({ data: message })
  } catch (err) {
    console.error('Gmail get failed:', err)
    return NextResponse.json({ error: 'Failed to load email' }, { status: 502 })
  }
}
