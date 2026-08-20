"use client"

import { format, isSameDay } from "date-fns"
import {
  AlignLeftIcon,
  CalendarDaysIcon,
  Clock3Icon,
  ExternalLinkIcon,
  FileIcon,
  Globe2Icon,
  ImageIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  Repeat2Icon,
  StarIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import {
  PlateElement,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react"
import { useEffect, useState } from "react"

import { attachmentUrl, getEmail } from "@/lib/api/emails"
import { getEvent } from "@/lib/api/events"
import {
  avatarTint,
  CATEGORY_STYLE,
  formatBytes,
  formatFullDate,
  initials,
  parseAddress,
  parseAddressList,
  type EmailCategory,
} from "@/components/email/utils"
import {
  toEmailEmbedSnapshot,
  toEventEmbedSnapshot,
  type EmailEmbedSnapshot,
  type EventEmbedSnapshot,
  type TEmailEmbedElement,
  type TEventEmbedElement,
} from "@/lib/document-embeds"
import { cn } from "@/lib/utils"

const EVENT_COLOR: Record<string, string> = {
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  emerald: "bg-emerald-500",
  orange: "bg-orange-500",
}

function eventRange(snapshot: EventEmbedSnapshot): string {
  const start = new Date(snapshot.start)
  const end = new Date(snapshot.end)
  if (Number.isNaN(start.getTime())) return "Date unavailable"
  if (snapshot.allDay) return `${format(start, "EEEE, MMMM d")} · All day`
  if (Number.isNaN(end.getTime())) return format(start, "EEEE, MMMM d · h:mm a")
  return isSameDay(start, end)
    ? `${format(start, "EEEE, MMMM d · h:mm a")} – ${format(end, "h:mm a")}`
    : `${format(start, "MMM d · h:mm a")} – ${format(end, "MMM d · h:mm a")}`
}

function emailDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : formatFullDate(value)
}

function eventDuration(snapshot: EventEmbedSnapshot): string | null {
  if (snapshot.allDay) return null
  const start = new Date(snapshot.start).getTime()
  const end = new Date(snapshot.end).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  const minutes = Math.round((end - start) / 60_000)
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${minutes} min`
  if (!remainder) return `${hours} hr${hours === 1 ? "" : "s"}`
  return `${hours} hr ${remainder} min`
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function recurrenceLabel(
  recurrence: EventEmbedSnapshot["recurrence"]
): string | null {
  if (!recurrence) return null
  if (recurrence.readOnly) return "Custom repeat"
  const interval = recurrence.interval ?? 1
  const unit =
    recurrence.frequency === "daily"
      ? "day"
      : recurrence.frequency === "weekly"
        ? "week"
        : recurrence.frequency === "monthly"
          ? "month"
          : "year"
  let label = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`
  if (recurrence.frequency === "weekly" && recurrence.byWeekday?.length) {
    label += ` · ${recurrence.byWeekday.map((day) => WEEKDAY[day]).join(", ")}`
  }
  if (recurrence.ends === "on" && recurrence.until) {
    const until = new Date(`${recurrence.until}T00:00:00`)
    label += Number.isNaN(until.getTime())
      ? ` · through ${recurrence.until}`
      : ` · through ${format(until, "MMM d")}`
  } else if (recurrence.ends === "after" && recurrence.count) {
    label += ` · ${recurrence.count} times`
  }
  return label
}

function categoryForLabels(labels: string[] | undefined) {
  const category: EmailCategory | null = labels?.includes("CATEGORY_SOCIAL")
    ? "social"
    : labels?.includes("CATEGORY_PROMOTIONS")
      ? "promotions"
      : labels?.includes("CATEGORY_UPDATES")
        ? "updates"
        : labels?.includes("CATEGORY_FORUMS")
          ? "forums"
          : labels?.includes("CATEGORY_PERSONAL")
            ? "primary"
            : null
  return category ? CATEGORY_STYLE[category] : null
}

function recipientSummary(to?: string, cc?: string): string | null {
  const recipients = [...parseAddressList(to ?? ""), ...parseAddressList(cc ?? "")]
  if (!recipients.length) return null
  const names = recipients.map((recipient) => recipient.name)
  if (names.length === 1) return `to ${names[0]}`
  if (names.length === 2) return `to ${names[0]} and ${names[1]}`
  return `to ${names[0]}, ${names[1]} +${names.length - 2}`
}

export function EventEmbedElement(
  props: PlateElementProps<TEventEmbedElement>
) {
  const selected = useSelected()
  const readOnly = useReadOnly()
  const [liveSource, setLiveSource] = useState<{
    sourceId: string
    embeddedSnapshot: EventEmbedSnapshot
    snapshot: EventEmbedSnapshot
  } | null>(null)
  const [sourceUnavailable, setSourceUnavailable] = useState(false)
  const snapshot =
    liveSource?.sourceId === props.element.eventId &&
    liveSource.embeddedSnapshot === props.element.snapshot
      ? liveSource.snapshot
      : props.element.snapshot
  const start = new Date(snapshot.start)
  const duration = eventDuration(snapshot)
  const recurrence = recurrenceLabel(snapshot.recurrence)

  useEffect(() => {
    let cancelled = false
    getEvent(props.element.eventId)
      .then((event) => {
        if (cancelled) return
        setLiveSource({
          sourceId: props.element.eventId,
          embeddedSnapshot: props.element.snapshot,
          snapshot: toEventEmbedSnapshot(event),
        })
        setSourceUnavailable(false)
      })
      .catch(() => {
        if (!cancelled) setSourceUnavailable(true)
      })
    return () => {
      cancelled = true
    }
  }, [props.element.eventId, props.element.snapshot])
  const params = new URLSearchParams({
    event: props.element.eventId,
    date: snapshot.start,
  })

  return (
    <PlateElement className="my-3" {...props}>
      <div
        contentEditable={false}
        className={cn(
          "group relative overflow-hidden rounded-card bg-surface shadow-card transition-shadow",
          selected && "ring-2 ring-accent/35"
        )}
      >
        <span
          className={cn(
            "absolute inset-y-0 left-0 w-1",
            EVENT_COLOR[snapshot.color ?? "sky"] ?? EVENT_COLOR.sky
          )}
        />
        <div className="relative flex items-start gap-3 px-3.5 py-3 sm:px-4">
          <span className="grid w-11 shrink-0 overflow-hidden rounded-control bg-inset text-center shadow-hairline">
            <span className="bg-accent-tint px-1 py-0.5 text-[8px] font-semibold uppercase text-accent-ink">
              {Number.isNaN(start.getTime()) ? "Event" : format(start, "MMM")}
            </span>
            <span className="px-1 py-1 text-[17px] font-semibold tabular-nums text-ink">
              {Number.isNaN(start.getTime()) ? <CalendarDaysIcon className="mx-auto size-4" /> : format(start, "d")}
            </span>
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  EVENT_COLOR[snapshot.color ?? "sky"] ?? EVENT_COLOR.sky
                )}
              />
              <span className="truncate text-[14px] font-semibold text-ink">
                {snapshot.title || "Untitled event"}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] font-medium tabular-nums text-ink-2">
              {eventRange(snapshot)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-ink-3">
              {duration && (
                <span className="inline-flex items-center gap-1">
                  <Clock3Icon className="size-3" /> {duration}
                </span>
              )}
              {snapshot.location && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPinIcon className="size-3 shrink-0" />
                  <span className="max-w-48 truncate">{snapshot.location}</span>
                </span>
              )}
              {recurrence && (
                <span className="inline-flex items-center gap-1">
                  <Repeat2Icon className="size-3" /> {recurrence}
                </span>
              )}
              {snapshot.timezone && (
                <span className="inline-flex items-center gap-1">
                  <Globe2Icon className="size-3" /> {snapshot.timezone}
                </span>
              )}
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-0.5">
            <Link
              href={`/cal?${params.toString()}`}
              aria-label="Open event in calendar"
              title="Open in calendar"
              className="grid size-8 place-items-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            >
              <ExternalLinkIcon className="size-3.5" />
            </Link>
            {!readOnly && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  props.editor.tf.removeNodes({ at: props.element })
                  props.editor.tf.focus()
                }}
                aria-label="Remove embedded event"
                title="Remove embed"
                className="grid size-8 place-items-center rounded-control text-ink-3 transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </span>
        </div>
        {snapshot.description && (
          <div className="flex gap-2 border-t border-line bg-inset/60 px-3.5 py-2.5 sm:px-4">
            <AlignLeftIcon className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
            <p className="line-clamp-3 text-[11.5px] leading-relaxed whitespace-pre-line text-ink-2">
              {snapshot.description}
            </p>
          </div>
        )}
        {sourceUnavailable && (
          <p className="border-t border-line px-3.5 py-1.5 text-[10px] text-amber-600 dark:text-amber-400 sm:px-4">
            Showing saved details · source unavailable
          </p>
        )}
      </div>
      {props.children}
    </PlateElement>
  )
}

export function EmailEmbedElement(
  props: PlateElementProps<TEmailEmbedElement>
) {
  const selected = useSelected()
  const readOnly = useReadOnly()
  const [liveSource, setLiveSource] = useState<{
    sourceId: string
    embeddedSnapshot: EmailEmbedSnapshot
    snapshot: EmailEmbedSnapshot
  } | null>(null)
  const [sourceUnavailable, setSourceUnavailable] = useState(false)
  const snapshot =
    liveSource?.sourceId === props.element.emailId &&
    liveSource.embeddedSnapshot === props.element.snapshot
      ? liveSource.snapshot
      : props.element.snapshot
  const sender = parseAddress(snapshot.from || "Unknown sender")
  const recipients = recipientSummary(snapshot.to, snapshot.cc)
  const labels = snapshot.labels ?? []
  const category = categoryForLabels(labels)
  const important = labels.includes("IMPORTANT")
  const starred = labels.includes("STARRED")
  const attachments = snapshot.attachments ?? []
  const bodyPreview = snapshot.bodyPreview || snapshot.snippet

  useEffect(() => {
    let cancelled = false
    getEmail(props.element.emailId)
      .then((email) => {
        if (cancelled) return
        setLiveSource({
          sourceId: props.element.emailId,
          embeddedSnapshot: props.element.snapshot,
          snapshot: toEmailEmbedSnapshot(email),
        })
        setSourceUnavailable(false)
      })
      .catch(() => {
        if (!cancelled) setSourceUnavailable(true)
      })
    return () => {
      cancelled = true
    }
  }, [props.element.emailId, props.element.snapshot])

  return (
    <PlateElement className="my-3" {...props}>
      <div
        contentEditable={false}
        className={cn(
          "group overflow-hidden rounded-card bg-surface shadow-card transition-shadow",
          selected && "ring-2 ring-accent/35"
        )}
      >
        <div className="flex items-start gap-3 px-3.5 py-3 sm:px-4">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
              avatarTint(sender.email || sender.name)
            )}
          >
            {initials(sender.name)}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex min-w-0 items-center gap-2">
              {snapshot.unread && (
                <span className="size-1.5 shrink-0 rounded-full bg-sky-500" title="Unread" />
              )}
              <span className="truncate text-[12px] font-semibold text-ink">
                {sender.name}
              </span>
              {starred && <StarIcon className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
              <span className="shrink-0 text-[10.5px] tabular-nums text-ink-3">
                {emailDate(snapshot.date)}
              </span>
            </div>
            {recipients && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-ink-3">
                <UsersIcon className="size-3 shrink-0" /> {recipients}
              </p>
            )}
            <p className="mt-1 truncate text-[14px] font-semibold text-ink">
              {snapshot.subject || "(no subject)"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {important && <EmbedBadge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Important</EmbedBadge>}
              {category && <EmbedBadge className={category.className}>{category.label}</EmbedBadge>}
              {(snapshot.messageCount ?? 1) > 1 && (
                <EmbedBadge>
                  <MessageSquareTextIcon className="size-2.5" /> {snapshot.messageCount} messages
                </EmbedBadge>
              )}
              {(snapshot.hasAttachments || attachments.length > 0) && (
                <EmbedBadge>
                  <PaperclipIcon className="size-2.5" />
                  {attachments.length || "Has"} attachment{attachments.length === 1 ? "" : "s"}
                </EmbedBadge>
              )}
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-0.5">
            <Link
              href={`/mail?email=${encodeURIComponent(props.element.emailId)}`}
              aria-label="Open email in mail"
              title="Open in mail"
              className="grid size-8 place-items-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            >
              <ExternalLinkIcon className="size-3.5" />
            </Link>
            {!readOnly && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  props.editor.tf.removeNodes({ at: props.element })
                  props.editor.tf.focus()
                }}
                aria-label="Remove embedded email"
                title="Remove embed"
                className="grid size-8 place-items-center rounded-control text-ink-3 transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </span>
        </div>
        {bodyPreview && (
          <div className="border-t border-line bg-inset/60 px-3.5 py-2.5 sm:px-4">
            <p className="line-clamp-4 text-[11.5px] leading-relaxed whitespace-pre-line text-ink-2">
              {bodyPreview}
            </p>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-line px-3.5 py-2 sm:px-4">
            {attachments.slice(0, 3).map((attachment) => {
              const Icon = attachment.mimeType.startsWith("image/") ? ImageIcon : FileIcon
              return (
                <a
                  key={attachment.attachmentId}
                  href={attachmentUrl(props.element.emailId, attachment)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 max-w-48 items-center gap-1.5 rounded-control bg-inset px-2 py-1 text-[10.5px] text-ink-2 shadow-hairline transition-colors hover:bg-hover hover:text-ink"
                >
                  <Icon className="size-3 shrink-0 text-ink-3" />
                  <span className="truncate">{attachment.filename}</span>
                  {attachment.size > 0 && (
                    <span className="shrink-0 text-[9.5px] text-ink-3">{formatBytes(attachment.size)}</span>
                  )}
                </a>
              )
            })}
            {attachments.length > 3 && (
              <span className="inline-flex items-center px-1 text-[10px] text-ink-3">
                +{attachments.length - 3} more
              </span>
            )}
          </div>
        )}
        {sourceUnavailable && (
          <p className="border-t border-line px-3.5 py-1.5 text-[10px] text-amber-600 dark:text-amber-400 sm:px-4">
            Showing saved details · source unavailable
          </p>
        )}
      </div>
      {props.children}
    </PlateElement>
  )
}

function EmbedBadge({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full bg-field px-1.5 text-[9.5px] font-medium text-ink-3",
        className
      )}
    >
      {children}
    </span>
  )
}