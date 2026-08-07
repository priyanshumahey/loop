import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PublicSharedCalendar } from "@/components/cal/public-shared-calendar"
import { LoopLogo } from "@/components/loop-logo"
import { getPublicCalendarShare } from "@/lib/db/calendar-shares"

export const metadata: Metadata = {
  title: "Shared calendar · Loop",
  robots: { index: false, follow: false },
}

export default async function SharedCalendarPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!/^[a-f0-9]{32}$/.test(token)) notFound()

  const result = await getPublicCalendarShare(token)
  if (!result.success) throw new Error("Unable to load this calendar")
  if (!result.data) notFound()

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--muted),transparent_15%),transparent_42%),linear-gradient(to_bottom,var(--background),color-mix(in_oklch,var(--muted),var(--background)_70%))] px-3 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5">
          <div>
            <LoopLogo />
            <h1 className="mt-5 font-heading text-2xl font-semibold sm:text-3xl">
              {result.data.name}
            </h1>
          </div>
        </header>
        <PublicSharedCalendar share={result.data} token={token} />
      </div>
    </main>
  )
}