'use client'

import { useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ')

export function GoogleSignInButton({ label = 'Continue with Google' }: { label?: string }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: GOOGLE_SCOPES,
        // access_type=offline + prompt=consent are required for Google to return
        // a refresh token so we can keep Gmail/Calendar access after login.
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) {
      setError(error.message)
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleSignIn}
        disabled={isLoading}
      >
        {isLoading ? 'Redirecting...' : label}
      </Button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
