import { NextResponse, type NextRequest } from 'next/server'
import { google } from 'googleapis'

import { encrypt } from '@/lib/encryption'
import { getOAuth2Client, STATE_COOKIE } from '@/lib/google'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const state = url.searchParams.get('state')
  const storedState = req.cookies.get(STATE_COOKIE)?.value

  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, url.origin))
    response.cookies.delete(STATE_COOKIE)
    return response
  }

  if (error) {
    return redirect(`/?google_error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return redirect('/?google_error=no_code')
  }

  if (!state || !storedState || state !== storedState) {
    return redirect('/?google_error=invalid_state')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect('/auth/login?google_error=unauthorized')
  }

  const oauth2Client = getOAuth2Client()

  try {
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      return redirect('/?google_error=no_tokens')
    }

    oauth2Client.setCredentials(tokens)
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const email = profile.data.emailAddress ?? null

    const { error: dbError } = await supabase.from('oauth_tokens').upsert(
      {
        user_id: user.id,
        provider: 'google',
        access_token: encrypt(tokens.access_token),
        refresh_token: encrypt(tokens.refresh_token),
        expiry_date: tokens.expiry_date ?? Date.now() + 3600 * 1000,
        email,
      },
      { onConflict: 'user_id,provider' }
    )

    if (dbError) {
      return redirect('/?google_error=db_error')
    }

    return redirect('/?google_connected=true')
  } catch {
    return redirect('/?google_error=token_exchange_failed')
  }
}
