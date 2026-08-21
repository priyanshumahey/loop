import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { LoopMark } from "@/components/loop-logo"
import { ManageBooking } from "@/components/scheduling/manage-booking"
import { getPublicBooking } from "@/lib/db/scheduling"

export const metadata: Metadata = {
  title: "Manage booking · Loop",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ uid: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const [{ uid }, { token }] = await Promise.all([params, searchParams])
  if (!z.uuid().safeParse(uid).success || !token || token.length > 256) notFound()

  const result = await getPublicBooking(uid, token)
  if (!result.success || !result.data) notFound()

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--muted),transparent_15%),transparent_42%),linear-gradient(to_bottom,var(--background),color-mix(in_oklch,var(--muted),var(--background)_70%))] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
            <LoopMark className="h-4 w-[13px]" />
          </span>
          <span className="font-heading text-sm font-semibold">Loop</span>
        </div>
        <section className="overflow-hidden rounded-lg border border-border/70 bg-background shadow-xl shadow-foreground/5">
          <ManageBooking
            initialBooking={result.data}
            managementToken={token}
          />
        </section>
      </div>
    </main>
  )
}