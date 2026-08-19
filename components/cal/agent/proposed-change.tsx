"use client"

import { format, isSameDay } from "date-fns"
import {
  CalendarPlusIcon,
  CheckIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { EventTooltip } from "@/components/event-calendar/event-tooltip"
import { AgentCard, AgentNotice, LoadingState } from "@/components/agent"
import type {
  CalendarEvent,
  EventColor,
  EventRecurrence,
  RecurrenceScope,
} from "@/components/event-calendar/types"
import type { AgentEvent } from "@/lib/cal-agent/tools"
import { cn } from "@/lib/utils"

export type WriteAction = "create" | "update" | "delete"

/** Small color dot to preview an event's requested color on the card. */
const COLOR_DOT: Record<string, string> = {
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  emerald: "bg-emerald-500",
  orange: "bg-orange-500",
}

/** Adapt the compact agent event shape to the calendar's event type. */
function toCalendarEvent(event: AgentEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    start: new Date(event.start),
    end: new Date(event.end),
    allDay: event.allDay,
    color: (event.color ?? undefined) as EventColor | undefined,
    location: event.location ?? undefined,
    description: event.description ?? undefined,
  }
}

interface WriteInput {
  eventTitle?: string
  title?: string
  start?: string
  end?: string
  allDay?: boolean
  location?: string
  eventId?: string
  color?: string
  recurrence?: EventRecurrence
  recurrenceScope?: RecurrenceScope
}

interface WriteOutput {
  ok: boolean
  event?: AgentEvent
  error?: string
}

const META: Record<
  WriteAction,
  { label: string; icon: React.ReactNode; done: string }
> = {
  create: {
    label: "Create event",
    icon: <CalendarPlusIcon className="size-3.5" />,
    done: "Event created",
  },
  update: {
    label: "Update event",
    icon: <PencilIcon className="size-3.5" />,
    done: "Event updated",
  },
  delete: {
    label: "Delete event",
    icon: <Trash2Icon className="size-3.5" />,
    done: "Event deleted",
  },
}

const isValidDate = (d: Date) => !Number.isNaN(d.getTime())

function formatRecurrence(input: WriteInput): string | null {
  if (input.recurrenceScope === "series") return "All events in the series"
  if (input.recurrenceScope === "following") return "This and following events"
  if (input.recurrenceScope === "single") return "This event only"
  if (!input.recurrence) return null

  const frequency =
    input.recurrence.frequency === "daily"
      ? "Daily"
      : input.recurrence.frequency === "weekly"
        ? "Weekly"
        : input.recurrence.frequency === "monthly"
          ? "Monthly"
          : "Yearly"
  if (input.recurrence.ends === "after" && input.recurrence.count) {
    return `${frequency} · ${input.recurrence.count} events`
  }
  if (input.recurrence.ends === "on" && input.recurrence.until) {
    return `${frequency} · through ${input.recurrence.until}`
  }
  return frequency
}

function formatRange(input: WriteInput): string | null {
  if (!input.start) return null
  const start = new Date(input.start)
  // Args can stream in partially, so the date may be incomplete/invalid.
  if (!isValidDate(start)) return null
  if (input.allDay) return `${format(start, "EEE MMM d")} · All day`
  const end = input.end ? new Date(input.end) : null
  if (!end || !isValidDate(end)) return format(start, "EEE MMM d · h:mm a")
  const day = format(start, "EEE MMM d")
  const from = format(start, "h:mm a")
  const to = format(end, "h:mm a")
  return isSameDay(start, end)
    ? `${day} · ${from} – ${to}`
    : `${day}, ${from} → ${format(end, "EEE MMM d")}, ${to}`
}

/**
 * Confirmation card for a mutating tool call. In the `approval-requested` state
 * it shows Approve / Reject; afterward it reflects the outcome. Nothing is
 * written to the calendar until the user approves.
 */
export function ProposedChange({
  action,
  state,
  input,
  output,
  onApprove,
  onReject,
  onOpenEvent,
}: {
  action: WriteAction
  state: string
  input: WriteInput
  output?: WriteOutput
  onApprove?: () => void
  onReject?: () => void
  onOpenEvent?: (event: AgentEvent) => void
}) {
  const meta = META[action]
  const range = formatRange(input)
  const recurrence = formatRecurrence(input)
  const title =
    input.title ?? input.eventTitle ?? output?.event?.title ?? "(event)"

  // Terminal outcomes.
  if (state === "output-denied") {
    return (
      <StatusRow icon={<XIcon className="size-3.5" />} tone="muted">
        Cancelled — {meta.label.toLowerCase()}
      </StatusRow>
    )
  }
  if (state === "output-error") {
    return (
      <StatusRow icon={<XIcon className="size-3.5" />} tone="error">
        Failed to {action} event.
      </StatusRow>
    )
  }
  if (state === "output-available") {
    if (output && !output.ok) {
      return (
        <StatusRow icon={<XIcon className="size-3.5" />} tone="error">
          {output.error ?? `Failed to ${action} event.`}
        </StatusRow>
      )
    }
    const event = output?.event
    return (
      <StatusRow icon={<CheckIcon className="size-3.5" />} tone="success">
        {meta.done}
        {event && action !== "delete" && (
          <>
            <span className="text-muted-foreground">·</span>
            <EventLink event={event} onOpen={onOpenEvent} />
          </>
        )}
      </StatusRow>
    )
  }

  const awaiting = state === "approval-requested"

  return (
    <AgentCard
      title={meta.label}
      icon={meta.icon}
      tone={action === "delete" ? "danger" : "default"}
      className="max-w-sm"
      footer={
        awaiting ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onApprove}
              className="inline-flex h-7 items-center gap-1 rounded-control bg-ink px-3 text-[12px] font-medium text-canvas shadow-btn transition-[opacity,transform] hover:opacity-90 active:scale-[0.96]"
            >
              <CheckIcon className="size-3.5" />
              Approve
            </button>
            <button
              type="button"
              onClick={onReject}
              className="inline-flex h-7 items-center gap-1 rounded-control bg-surface px-3 text-[12px] font-medium text-ink-2 shadow-btn transition-[background-color,color,transform] hover:bg-hover hover:text-ink active:scale-[0.96]"
            >
              <XIcon className="size-3.5" />
              Reject
            </button>
          </div>
        ) : (
          <LoadingState
            label={state === "approval-responded" ? "Applying…" : "Preparing…"}
            variant="dots"
            className="py-0"
          />
        )
      }
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 text-[14px] font-medium text-foreground">
          {input.color && (
            <span
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                COLOR_DOT[input.color] ?? COLOR_DOT.sky
              )}
            />
          )}
          {title}
        </div>
        {range && (
          <div className="text-[12px] tabular-nums text-muted-foreground">
            {range}
          </div>
        )}
        {recurrence && (
          <div className="text-[12px] text-muted-foreground">{recurrence}</div>
        )}
        {input.location && (
          <div className="text-[12px] text-muted-foreground/80">
            {input.location}
          </div>
        )}
      </div>
    </AgentCard>
  )
}

function StatusRow({
  icon,
  tone,
  children,
}: {
  icon: React.ReactNode
  tone: "success" | "error" | "muted"
  children: React.ReactNode
}) {
  return (
    <AgentNotice
      icon={icon}
      title={<span className="flex min-w-0 items-center gap-1.5">{children}</span>}
      tone={tone === "success" ? "success" : tone === "error" ? "danger" : "muted"}
    />
  )
}

/**
 * A clickable link to a written event. Hovering reveals the same detail card
 * used on the calendar; clicking opens the event.
 */
function EventLink({
  event,
  onOpen,
}: {
  event: AgentEvent
  onOpen?: (event: AgentEvent) => void
}) {
  return (
    <EventTooltip event={toCalendarEvent(event)}>
      <button
        type="button"
        onClick={() => onOpen?.(event)}
        className="min-w-0 truncate rounded font-medium text-foreground underline decoration-foreground/40 decoration-dotted underline-offset-2 transition-colors hover:text-emerald-600 hover:decoration-solid dark:hover:text-emerald-400"
      >
        {event.title}
      </button>
    </EventTooltip>
  )
}
