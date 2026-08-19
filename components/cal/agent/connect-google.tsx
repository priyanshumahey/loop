"use client"

import { CalendarPlusIcon } from "lucide-react"

import { AgentCard } from "@/components/agent"

/**
 * Shown when a tool reports the user hasn't connected Google Calendar, so an
 * empty result is explained (rather than looking broken).
 */
export function ConnectGoogle({ description }: { description?: string }) {
  return (
    <AgentCard
      title="Connect Google Calendar"
      icon={<CalendarPlusIcon className="size-3.5" />}
      footer={
        <a
          href="/auth/google"
          className="inline-flex h-7 items-center gap-1.5 rounded-control bg-ink px-3 text-[12px] font-medium text-canvas shadow-btn transition-[opacity,transform] hover:opacity-90 active:scale-[0.96]"
        >
          <CalendarPlusIcon className="size-3.5" />
          Connect Google
        </a>
      }
    >
      <p className="text-[12px] text-muted-foreground">
        {description ?? (
          <>
            I couldn&apos;t find any events because Google Calendar isn&apos;t
            connected yet. Connect it to let me search and analyze your
            schedule.
          </>
        )}
      </p>
    </AgentCard>
  )
}
