import Link from "next/link"

import { LogoutButton } from "@/components/auth/logout-button"
import { Button, buttonVariants } from "@/components/ui/button"
import { decrypt, encrypt } from "@/lib/encryption"
import { getTodaysCalendarEvents, type CalendarEvent } from "@/lib/google"
import { createClient } from "@/lib/supabase/server"

function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return "All day"
  if (!event.start) return ""
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  return event.end ? `${fmt(event.start)} – ${fmt(event.end)}` : fmt(event.start)
}

export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let googleEmail: string | null = null
  let calendarEvents: CalendarEvent[] | null = null
  let calendarError: string | null = null
  if (user) {
    const { data } = await supabase
      .from("oauth_tokens")
      .select("email, access_token, refresh_token, expiry_date")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .single()
    googleEmail = data?.email ?? null

    if (data) {
      try {
        const { events, refreshed } = await getTodaysCalendarEvents({
          accessToken: decrypt(data.access_token),
          refreshToken: decrypt(data.refresh_token),
          expiryDate: Number(data.expiry_date),
        })
        calendarEvents = events

        // Persist a silently-refreshed access token so future requests stay valid.
        if (refreshed) {
          await supabase
            .from("oauth_tokens")
            .update({
              access_token: encrypt(refreshed.accessToken),
              expiry_date: refreshed.expiryDate,
            })
            .eq("user_id", user.id)
            .eq("provider", "google")
        }
      } catch (error) {
        calendarError = error instanceof Error ? error.message : "Failed to load calendar"
      }
    }
  }

  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">Project ready!</h1>
          <p>You may now add components and start building.</p>
          <p>We&apos;ve already added the button component for you.</p>
          <Button className="mt-2">Button</Button>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="font-medium">Google</h2>
          {!user ? (
            <p className="text-muted-foreground">
              <Link href="/auth/login" className="underline underline-offset-4">
                Log in
              </Link>{" "}
              to connect your Google account.
            </p>
          ) : googleEmail ? (
            <p className="text-muted-foreground">Connected as {googleEmail}</p>
          ) : (
            <Link
              href="/auth/google"
              className={buttonVariants({ variant: "secondary", className: "w-fit" })}
            >
              Connect Google
            </Link>
          )}
        </div>

        {user && (
          <div className="flex flex-col gap-2">
            <h2 className="font-medium">Account</h2>
            <p className="text-muted-foreground">Signed in as {user.email}</p>
            <div className="w-fit">
              <LogoutButton />
            </div>
          </div>
        )}

        {user && googleEmail && (
          <div className="flex flex-col gap-2">
            <h2 className="font-medium">Today&apos;s calendar</h2>
            {calendarError ? (
              <p className="text-red-500">Couldn&apos;t load events: {calendarError}</p>
            ) : calendarEvents && calendarEvents.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {calendarEvents.map((event) => (
                  <li key={event.id} className="flex flex-col leading-normal">
                    <span className="font-medium">
                      {event.htmlLink ? (
                        <a
                          href={event.htmlLink}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-4"
                        >
                          {event.summary}
                        </a>
                      ) : (
                        event.summary
                      )}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatEventTime(event)}
                      {event.location ? ` · ${event.location}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No events today.</p>
            )}
          </div>
        )}

        <div className="font-mono text-xs text-muted-foreground">
          (Press <kbd>d</kbd> to toggle dark mode)
        </div>
      </div>
    </div>
  )
}
