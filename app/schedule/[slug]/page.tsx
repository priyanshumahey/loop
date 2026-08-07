import { ClockIcon, VideoIcon } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LoopMark } from "@/components/loop-logo"
import { BookingForm } from "@/components/scheduling/booking-form"
import { getPublicEventType } from "@/lib/db/scheduling"

// Booking links are shared directly with invitees, not published.
export const metadata: Metadata = {
  title: "Book a time · Loop",
  robots: { index: false, follow: false },
}

export default async function PublicSchedulePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const result = await getPublicEventType(slug)
  if (!result.success) throw new Error("Unable to load this booking page")
  if (!result.data) notFound()

  const eventType = result.data

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--muted),transparent_15%),transparent_42%),linear-gradient(to_bottom,var(--background),color-mix(in_oklch,var(--muted),var(--background)_70%))] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
            <LoopMark className="h-4 w-[13px]" />
          </span>
          <span className="font-heading text-sm font-semibold">Loop</span>
        </div>

        <section className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-xl shadow-foreground/5">
          <header className="border-b border-border/70 px-5 py-5 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-heading text-2xl font-semibold">
                  {eventType.title}
                </h1>
                {eventType.description && (
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {eventType.description}
                  </p>
                )}
              </div>
              <span className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ClockIcon className="size-4" />
                  {eventType.durationMinutes} min
                </span>
                {eventType.location && (
                  <span className="flex items-center gap-1.5">
                    <VideoIcon className="size-4" />
                    {eventType.location}
                  </span>
                )}
              </span>
            </div>
          </header>
          <BookingForm eventType={eventType} />
        </section>
      </div>
    </main>
  )
}