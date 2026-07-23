import { NextResponse, type NextRequest } from 'next/server'

import { listInboxEmails } from '@/lib/google-sync'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/emails
 * Lists the user's most recent Gmail inbox messages (summaries only).
 * `connected` is false when the user has not linked Google.
 *
 * Query params: maxResults?, q? (Gmail search query), pageToken?
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const maxResults = searchParams.get('maxResults')
  const query = searchParams.get('q')
  const pageToken = searchParams.get('pageToken')
  const allMail = searchParams.get('allMail') === '1'

  try {
    const { connected, messages, nextPageToken } = await listInboxEmails(
      supabase,
      user.id,
      {
        maxResults: maxResults ? Number(maxResults) : undefined,
        query: query ?? undefined,
        pageToken: pageToken ?? undefined,
        includeAllMail: allMail,
      }
    )
    return NextResponse.json({ data: messages, connected, nextPageToken })
  } catch (err) {
    console.error('Gmail list failed:', err)
    return NextResponse.json({ error: 'Failed to load emails' }, { status: 502 })
  }
}
