import { randomBytes } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'

import { getAuthUrl, STATE_COOKIE } from '@/lib/google'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login?google_error=unauthorized', origin))
  }

  // Random state ties the callback to this request, preventing OAuth CSRF.
  const state = randomBytes(32).toString('hex')
  const response = NextResponse.redirect(getAuthUrl(state))
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return response
}
