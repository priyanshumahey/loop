import { NextResponse, type NextRequest } from 'next/server'

import { getInboxThread } from '@/lib/google-sync'
import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/emails/[id]/thread
 * Fetches every message in a conversation thread (each parsed in full), where
 * `[id]` is the Gmail thread id. Used by the reader to show the whole
 * conversation instead of a single message.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Thread ID is required' }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { connected, messages } = await getInboxThread(supabase, user.id, id)
    if (!connected) {
      return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
    }
    return NextResponse.json({ data: messages })
  } catch (err) {
    console.error('Gmail thread fetch failed:', err)
    return NextResponse.json({ error: 'Failed to load thread' }, { status: 502 })
  }
}
