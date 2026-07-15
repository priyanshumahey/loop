"use client"

import { CalendarPlusIcon } from "lucide-react"

/**
 * Shown when a tool reports the user hasn't connected Google Calendar, so an
 * empty result is explained (rather than looking broken).
 */
export function ConnectGoogle({ description }: { description?: string }) {
  return (
    <div className="my-2 flex flex-col items-start gap-2 rounded-xl border border-dashed border-border/70 bg-muted/30 px-3 py-3">
      <div className="text-[13px] font-medium text-foreground">
        Connect Google Calendar
      </div>
      <p className="text-[12px] text-muted-foreground">
        {description ?? (
          <>
            I couldn&apos;t find any events because Google Calendar isn&apos;t
            connected yet. Connect it to let me search and analyze your
            schedule.
          </>
        )}
      </p>
      <a
        href="/auth/google"
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90"
      >
        <CalendarPlusIcon className="size-3.5" />
        Connect Google
      </a>
    </div>
  )
}
