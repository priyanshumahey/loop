"use client"

import {
  CalendarClockIcon,
  CalendarRangeIcon,
  CalendarSearchIcon,
  ChartColumnIcon,
  ClockIcon,
  ListIcon,
  MailIcon,
  MailOpenIcon,
  MessagesSquareIcon,
  PenSquareIcon,
  RefreshCwIcon,
} from "lucide-react"

import { AgendaList } from "@/components/cal/agent/agenda-list"
import { AvailabilityCheck } from "@/components/cal/agent/availability-check"
import { CalendarStatsCard } from "@/components/cal/agent/calendar-stats-card"
import {
  EmailDetailCard,
  EmailDraftCard,
  EmailResults,
  EmailResultsSkeleton,
  EmailThread,
} from "@/components/cal/agent/email-results"
import { EventSearchResults } from "@/components/cal/agent/event-search-results"
import { FreeSlots } from "@/components/cal/agent/free-slots"
import { MiniCalendar } from "@/components/cal/agent/mini-calendar"
import {
  ProposedChange,
  type WriteAction,
  type WriteInput,
  type WriteOutput,
} from "@/components/cal/agent/proposed-change"
import type {
  AgentDraft,
  AgentEmail,
  AgentEvent,
  AgentThreadMessage,
  AvailabilityCheck as AvailabilityData,
  CalendarStats,
  CalendarViewData,
  FreeSlot,
} from "@/lib/cal-agent/tools"

export interface WorkspaceToolPartData {
  type?: string
  state?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  errorText?: string
  approval?: { id?: string; approved?: boolean }
}

const WORKSPACE_TOOL_TYPES = new Set([
  "tool-searchEvents",
  "tool-getEventById",
  "tool-calendarStats",
  "tool-listEvents",
  "tool-checkAvailability",
  "tool-showCalendar",
  "tool-findFreeSlots",
  "tool-createEvent",
  "tool-updateEvent",
  "tool-deleteEvent",
  "tool-listEmails",
  "tool-readEmail",
  "tool-readThread",
  "tool-draftReply",
])

export function isWorkspaceToolType(type?: string): boolean {
  return Boolean(type && WORKSPACE_TOOL_TYPES.has(type))
}

export function WorkspaceTool({
  part,
  onApprove,
  onReject,
  onOpenEvent,
  onOpenEmail,
  onPickSlot,
}: {
  part: WorkspaceToolPartData
  onApprove?: (approvalId: string) => void
  onReject?: (approvalId: string) => void
  onOpenEvent?: (event: AgentEvent) => void
  onOpenEmail?: (email: AgentEmail) => void
  onPickSlot?: (slot: FreeSlot) => void
}) {
  if (!part.type || !isWorkspaceToolType(part.type)) return null
  const toolName = part.type.replace(/^tool-/, "")

  if (
    toolName === "createEvent" ||
    toolName === "updateEvent" ||
    toolName === "deleteEvent"
  ) {
    const action: WriteAction =
      toolName === "createEvent"
        ? "create"
        : toolName === "updateEvent"
          ? "update"
          : "delete"
    const approvalId = part.approval?.id
    return (
      <ProposedChange
        action={action}
        state={part.state ?? "input-streaming"}
        input={(part.input ?? {}) as WriteInput}
        output={part.output as WriteOutput | undefined}
        onApprove={approvalId ? () => onApprove?.(approvalId) : undefined}
        onReject={approvalId ? () => onReject?.(approvalId) : undefined}
        onOpenEvent={onOpenEvent}
      />
    )
  }

  if (toolName === "searchEvents") {
    if (part.state !== "output-available") {
      return <Activity icon={CalendarSearchIcon} label="Searching events..." />
    }
    const output = part.output as unknown as {
      count: number
      events: AgentEvent[]
      connected: boolean
      error?: string
    }
    return (
      <EventSearchResults
        query={String(part.input?.query ?? "")}
        count={output.count}
        events={output.events}
        connected={output.connected}
        error={output.error}
        onOpenEvent={onOpenEvent}
      />
    )
  }

  if (toolName === "getEventById") {
    if (part.state !== "output-available") {
      return <Activity icon={RefreshCwIcon} label="Refreshing event..." />
    }
    const output = part.output as unknown as {
      event?: AgentEvent
      error?: string
    }
    return output.event ? (
      <EventSearchResults
        query=""
        count={1}
        events={[output.event]}
        connected
        error={output.error}
        onOpenEvent={onOpenEvent}
      />
    ) : (
      <Activity
        icon={CalendarSearchIcon}
        label={output.error ?? "Event not found"}
        active={false}
      />
    )
  }

  if (toolName === "calendarStats") {
    if (part.state !== "output-available") {
      return <Activity icon={ChartColumnIcon} label="Analyzing your schedule..." />
    }
    const output = part.output as unknown as {
      stats?: CalendarStats
      connected: boolean
      error?: string
    }
    return (
      <CalendarStatsCard
        stats={output.stats}
        connected={output.connected}
        error={output.error}
      />
    )
  }

  if (toolName === "listEvents") {
    if (part.state !== "output-available") {
      return <Activity icon={ListIcon} label="Loading your agenda..." />
    }
    const output = part.output as unknown as {
      events: AgentEvent[]
      connected: boolean
      error?: string
    }
    return (
      <AgendaList
        events={output.events}
        connected={output.connected}
        error={output.error}
        onOpenEvent={onOpenEvent}
      />
    )
  }

  if (toolName === "checkAvailability") {
    if (part.state !== "output-available") {
      return <Activity icon={ClockIcon} label="Checking that time..." />
    }
    return (
      <AvailabilityCheck
        result={part.output as unknown as AvailabilityData}
        onOpenEvent={onOpenEvent}
      />
    )
  }

  if (toolName === "showCalendar") {
    if (part.state !== "output-available") {
      return <Activity icon={CalendarRangeIcon} label="Building your calendar..." />
    }
    const output = part.output as unknown as CalendarViewData
    return (
      <MiniCalendar
        view={output.view}
        rangeStart={output.rangeStart}
        rangeEnd={output.rangeEnd}
        events={output.events}
        connected={output.connected}
        error={output.error}
        onOpenEvent={onOpenEvent}
      />
    )
  }

  if (toolName === "findFreeSlots") {
    if (part.state !== "output-available") {
      return <Activity icon={CalendarClockIcon} label="Finding open time..." />
    }
    const output = part.output as unknown as {
      slots: FreeSlot[]
      durationMinutes: number
      connected: boolean
      error?: string
    }
    return (
      <FreeSlots
        slots={output.slots}
        durationMinutes={output.durationMinutes}
        connected={output.connected}
        error={output.error}
        onPick={onPickSlot}
      />
    )
  }

  if (toolName === "listEmails") {
    if (part.state !== "output-available") {
      return (
        <EmailResultsSkeleton
          label={part.input?.unreadOnly ? "Checking unread mail..." : "Fetching your inbox..."}
        />
      )
    }
    const output = part.output as unknown as {
      count: number
      emails: AgentEmail[]
      connected: boolean
      unreadOnly: boolean
      query?: string
      error?: string
    }
    return (
      <EmailResults
        emails={output.emails}
        count={output.count}
        connected={output.connected}
        unreadOnly={output.unreadOnly}
        query={output.query}
        error={output.error}
        onOpenEmail={onOpenEmail}
      />
    )
  }

  if (toolName === "readEmail") {
    if (part.state !== "output-available") {
      return <Activity icon={MailOpenIcon} label="Opening the email..." />
    }
    const output = part.output as unknown as {
      connected: boolean
      email?: AgentThreadMessage
      error?: string
    }
    return (
      <EmailDetailCard
        email={output.email}
        connected={output.connected}
        error={output.error}
        onOpenEmail={onOpenEmail}
      />
    )
  }

  if (toolName === "readThread") {
    if (part.state !== "output-available") {
      return <Activity icon={MessagesSquareIcon} label="Reading the conversation..." />
    }
    const output = part.output as unknown as {
      connected: boolean
      count: number
      subject?: string
      messages: AgentThreadMessage[]
      error?: string
    }
    return (
      <EmailThread
        subject={output.subject}
        messages={output.messages}
        count={output.count}
        connected={output.connected}
        error={output.error}
        onOpenEmail={onOpenEmail}
      />
    )
  }

  if (toolName === "draftReply") {
    if (part.state !== "output-available") {
      return <Activity icon={PenSquareIcon} label="Drafting a reply..." />
    }
    const output = part.output as unknown as { draft: AgentDraft }
    return <EmailDraftCard draft={output.draft} />
  }

  return <Activity icon={MailIcon} label="Working..." />
}

function Activity({
  icon: Icon,
  label,
  active = true,
}: {
  icon: typeof MailIcon
  label: string
  active?: boolean
}) {
  return (
    <div className="my-1 flex items-center gap-2 rounded-control px-1.5 py-1 text-[11.5px] text-ink-3">
      <span className={active ? "loop-halo" : undefined}>
        <Icon className="size-3.5" />
      </span>
      <span className={active ? "loop-shimmer" : undefined}>{label}</span>
    </div>
  )
}