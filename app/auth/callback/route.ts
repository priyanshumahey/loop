import { NextResponse, type NextRequest } from 'next/server'

import { encrypt } from '@/lib/encryption'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const _next = searchParams.get('next')
  const next = _next?.startsWith('/') ? _next : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?error=No code provided`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(error?.message ?? 'Auth failed')}`
    )
  }

  // Persist the Google tokens so we can call Gmail/Calendar on the user's behalf.
  // Google only returns the refresh token on the first consent (access_type=offline
  // + prompt=consent), which we request in the sign-in button.
  const { provider_token, provider_refresh_token, user } = data.session
  if (provider_token && provider_refresh_token && user) {
    await supabase.from('oauth_tokens').upsert(
      {
        user_id: user.id,
        provider: 'google',
        access_token: encrypt(provider_token),
        refresh_token: encrypt(provider_refresh_token),
        expiry_date: Date.now() + 3600 * 1000,
        email: user.email ?? null,
      },
      { onConflict: 'user_id,provider' }
    )
  }

  return NextResponse.redirect(`${origin}${next}?google_connected=true`)
}
