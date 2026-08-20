"use client"

import { CalendarPlusIcon, MailPlusIcon } from "lucide-react"

import { AgentCard } from "@/components/agent"

/**
 * Shown when a tool reports the user hasn't connected Google Calendar, so an
 * empty result is explained (rather than looking broken).
 */
export function ConnectGoogle({
  description,
  service = "calendar",
}: {
  description?: string
  service?: "calendar" | "gmail"
}) {
  const gmail = service === "gmail"
  const Icon = gmail ? MailPlusIcon : CalendarPlusIcon
  return (
    <AgentCard
      title={gmail ? "Connect Gmail" : "Connect Google Calendar"}
      icon={<Icon className="size-3.5" />}
      footer={
        <a
          href="/auth/google"
          className="inline-flex h-7 items-center gap-1.5 rounded-control bg-ink px-3 text-[12px] font-medium text-canvas shadow-btn transition-[opacity,transform] hover:opacity-90 active:scale-[0.96]"
        >
          <Icon className="size-3.5" />
          Connect Google
        </a>
      }
    >
      <p className="text-[12px] text-muted-foreground">
        {description ?? (
          gmail ? (
            <>
              Gmail isn&apos;t connected yet. Connect it to search, read, and
              draft replies from your inbox.
            </>
          ) : (
            <>
              I couldn&apos;t find any events because Google Calendar isn&apos;t
              connected yet. Connect it to let me search and analyze your
              schedule.
            </>
          )
        )}
      </p>
    </AgentCard>
  )
}
