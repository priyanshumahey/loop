"use client"

import { format, isSameDay } from "date-fns"
import {
  CalendarDaysIcon,
  CalendarPlusIcon,
  MailIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  RefreshCwIcon,
  Repeat2Icon,
  SearchIcon,
  StarIcon,
} from "lucide-react"
import { KEYS, type TElement } from "platejs"
import { useEditorRef } from "platejs/react"
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react"

import type { LoopDocumentEditor } from "@/components/documents/document-editor-kit"
import {
  EMAIL_EMBED_KEY,
  EVENT_EMBED_KEY,
  toEmailEmbedSnapshot,
  toEventEmbedSnapshot,
  type TEmailEmbedElement,
  type TEventEmbedElement,
} from "@/lib/document-embeds"
import type { CalendarEvent } from "@/components/event-calendar/types"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ToolbarButton } from "@/components/ui/toolbar"
import { listEmails, type Email } from "@/lib/api/emails"
import { syncEvents } from "@/lib/api/events"
import {
  avatarTint,
  deriveFlags,
  initials,
  parseAddress,
} from "@/components/email/utils"
import { cn } from "@/lib/utils"

type SourceTab = "calendar" | "email"

function eventWhen(event: CalendarEvent): string {
  if (event.allDay) return `${format(event.start, "EEE, MMM d")} · All day`
  return isSameDay(event.start, event.end)
    ? `${format(event.start, "EEE, MMM d · h:mm a")} – ${format(event.end, "h:mm a")}`
    : `${format(event.start, "MMM d · h:mm a")} – ${format(event.end, "MMM d · h:mm a")}`
}

function emailWhen(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : format(date, "MMM d")
}

function sortEventsForPicker(
  events: CalendarEvent[],
  now: number
): CalendarEvent[] {
  return [...events].sort((left, right) => {
    const leftTime = left.start.getTime()
    const rightTime = right.start.getTime()
    const leftUpcoming = leftTime >= now
    const rightUpcoming = rightTime >= now
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1
    return leftUpcoming ? leftTime - rightTime : rightTime - leftTime
  })
}

export function SourceEmbedPicker() {
  const editor = useEditorRef<LoopDocumentEditor>()
  const [open, setOpen] = useState(false)
  const [insertIndex, setInsertIndex] = useState(0)
  const [tab, setTab] = useState<SourceTab>("calendar")
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search.trim())
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [eventsConnected, setEventsConnected] = useState<boolean | null>(null)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [emails, setEmails] = useState<Email[]>([])
  const [emailsConnected, setEmailsConnected] = useState<boolean | null>(null)
  const [emailsLoading, setEmailsLoading] = useState(false)
  const [emailsError, setEmailsError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || tab !== "calendar" || events !== null) return
    let cancelled = false
    const now = new Date()
    const startDate = new Date(now)
    const endDate = new Date(now)
    startDate.setDate(startDate.getDate() - 30)
    endDate.setDate(endDate.getDate() + 90)
    syncEvents({ startDate, endDate })
      .then((result) => {
        if (cancelled) return
        setEvents(sortEventsForPicker(result.events, now.getTime()))
        setEventsConnected(result.connected)
        setEventsError(null)
      })
      .catch((error) => {
        if (!cancelled) {
          setEvents([])
          setEventsError(
            error instanceof Error ? error.message : "Failed to load events"
          )
        }
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [events, open, tab])

  useEffect(() => {
    if (!open || tab !== "email") return
    let cancelled = false
    const timer = setTimeout(() => {
      setEmailsLoading(true)
      listEmails({
        maxResults: 40,
        query: deferredSearch || undefined,
        allMail: Boolean(deferredSearch),
      })
        .then((result) => {
          if (cancelled) return
          setEmails(result.emails)
          setEmailsConnected(result.connected)
          setEmailsError(null)
        })
        .catch((error) => {
          if (!cancelled) {
            setEmails([])
            setEmailsError(
              error instanceof Error ? error.message : "Failed to load email"
            )
          }
        })
        .finally(() => {
          if (!cancelled) setEmailsLoading(false)
        })
    }, deferredSearch ? 300 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [deferredSearch, open, tab])

  const filteredEvents = useMemo(() => {
    const query = deferredSearch.toLowerCase()
    if (!query) return events ?? []
    return (events ?? []).filter((event) =>
      [event.title, event.location, event.description]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    )
  }, [deferredSearch, events])

  const insertEmbed = (node: TEventEmbedElement | TEmailEmbedElement) => {
    const index = Math.min(insertIndex, editor.children.length)
    const appended = index === editor.children.length
    editor.tf.withoutNormalizing(() => {
      editor.tf.insertNodes(node, { at: [index], select: true })
      if (appended) {
        editor.tf.insertNodes<TElement>(
          { type: KEYS.p, children: [{ text: "" }] },
          { at: [index + 1] }
        )
      }
    })
    editor.tf.focus()
    setOpen(false)
    setSearch("")
  }

  const insertEvent = (event: CalendarEvent) => {
    insertEmbed({
      type: EVENT_EMBED_KEY,
      eventId: event.id,
      snapshot: toEventEmbedSnapshot(event),
      children: [{ text: "" }],
    })
  }

  const insertEmail = (email: Email) => {
    insertEmbed({
      type: EMAIL_EMBED_KEY,
      emailId: email.id,
      snapshot: toEmailEmbedSnapshot(email),
      children: [{ text: "" }],
    })
  }

  const refreshEvents = () => {
    setEventsLoading(true)
    setEventsError(null)
    setEvents(null)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          const selection = editor.selection
          setInsertIndex(
            selection
              ? Math.max(selection.anchor.path[0], selection.focus.path[0]) + 1
              : editor.children.length
          )
        }
        setOpen(nextOpen)
        if (!nextOpen) setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        <ToolbarButton
          aria-label="Embed calendar event or email"
          tooltip="Embed calendar event or email"
        >
          <CalendarPlusIcon />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-1rem))] rounded-card p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b border-line p-2.5">
          <div className="flex items-center gap-1 rounded-control bg-inset p-0.5 shadow-hairline">
            <SourceTabButton
              active={tab === "calendar"}
              icon={CalendarDaysIcon}
              label="Calendar"
              onClick={() => {
                setTab("calendar")
                setSearch("")
              }}
            />
            <SourceTabButton
              active={tab === "email"}
              icon={MailIcon}
              label="Email"
              onClick={() => {
                setTab("email")
                setSearch("")
              }}
            />
          </div>
          <div className="relative mt-2">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tab === "calendar" ? "Search events" : "Search email"}
              className="h-8 pl-8 text-[12px]"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {tab === "calendar" ? (
            <CalendarResults
              events={filteredEvents}
              connected={eventsConnected}
              loading={eventsLoading}
              error={eventsError}
              query={deferredSearch}
              onRefresh={refreshEvents}
              onSelect={insertEvent}
            />
          ) : (
            <EmailResults
              emails={emails}
              connected={emailsConnected}
              loading={emailsLoading}
              error={emailsError}
              query={deferredSearch}
              onSelect={insertEmail}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SourceTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof CalendarDaysIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[6px] text-[11.5px] font-medium transition-colors",
        active ? "bg-surface text-ink shadow-btn" : "text-ink-3 hover:text-ink"
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

function CalendarResults({
  events,
  connected,
  loading,
  error,
  query,
  onRefresh,
  onSelect,
}: {
  events: CalendarEvent[]
  connected: boolean | null
  loading: boolean
  error: string | null
  query: string
  onRefresh: () => void
  onSelect: (event: CalendarEvent) => void
}) {
  if (loading) return <PickerLoading label="Loading events..." />
  if (error) {
    return <PickerError message={error} onRetry={onRefresh} />
  }
  if (connected === false && events.length === 0) {
    return <ConnectSource label="Connect Google Calendar to embed events." />
  }
  if (events.length === 0) {
    return <PickerEmpty label={query ? "No matching events" : "No events found"} />
  }
  return (
    <div className="flex flex-col">
      {events.slice(0, 40).map((event) => (
        <button
          key={event.id}
          type="button"
          onClick={() => onSelect(event)}
          className="flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-hover"
        >
          <span className="mt-0.5 grid w-9 shrink-0 overflow-hidden rounded-control bg-inset text-center shadow-hairline">
            <span className="bg-accent-tint px-1 py-0.5 text-[7px] font-semibold uppercase text-accent-ink">
              {format(event.start, "MMM")}
            </span>
            <span className="px-1 py-0.5 text-[13px] font-semibold tabular-nums text-ink">
              {format(event.start, "d")}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-ink">
              {event.title || "Untitled event"}
            </span>
            <span className="mt-0.5 block text-[10.5px] tabular-nums text-ink-3">
              {eventWhen(event)}
            </span>
            {event.location && (
              <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-ink-3">
                <MapPinIcon className="size-2.5" />
                <span className="truncate">{event.location}</span>
              </span>
            )}
            {event.recurrence && (
              <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-ink-3">
                <Repeat2Icon className="size-2.5" /> Repeats {event.recurrence.frequency}
              </span>
            )}
            {event.description && (
              <span className="mt-1 block truncate text-[10.5px] text-ink-3">
                {event.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

function EmailResults({
  emails,
  connected,
  loading,
  error,
  query,
  onSelect,
}: {
  emails: Email[]
  connected: boolean | null
  loading: boolean
  error: string | null
  query: string
  onSelect: (email: Email) => void
}) {
  if (loading) return <PickerLoading label="Loading email..." />
  if (error) return <PickerError message={error} />
  if (connected === false && emails.length === 0) {
    return <ConnectSource label="Connect Gmail to embed messages." />
  }
  if (emails.length === 0) {
    return <PickerEmpty label={query ? "No matching email" : "No email found"} />
  }
  return (
    <div className="flex flex-col">
      {emails.map((email) => (
        <EmailPickerRow key={email.id} email={email} onSelect={onSelect} />
      ))}
    </div>
  )
}

function EmailPickerRow({
  email,
  onSelect,
}: {
  email: Email
  onSelect: (email: Email) => void
}) {
  const sender = parseAddress(email.from)
  const { important, starred } = deriveFlags(email)
  return (
    <button
      type="button"
      onClick={() => onSelect(email)}
      className="flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-hover"
    >
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-[9.5px] font-semibold",
          avatarTint(sender.email || sender.name)
        )}
      >
        {initials(sender.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {email.unread && <span className="size-1.5 shrink-0 rounded-full bg-sky-500" />}
          <span className="truncate text-[11.5px] font-medium text-ink">
            {sender.name}
          </span>
          {important && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" title="Important" />}
          {starred && <StarIcon className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
          <span className="ml-auto shrink-0 text-[10px] text-ink-3">
            {emailWhen(email.date)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[12px] font-medium text-ink">
          {email.subject || "(no subject)"}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] text-ink-3">
          {email.snippet}
        </span>
        {(email.hasAttachments || email.messageCount > 1) && (
          <span className="mt-1 flex items-center gap-2 text-[9.5px] text-ink-3">
            {email.messageCount > 1 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquareTextIcon className="size-2.5" /> {email.messageCount} messages
              </span>
            )}
            {email.hasAttachments && (
              <span className="inline-flex items-center gap-1">
                <PaperclipIcon className="size-2.5" /> Attachments
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  )
}

function PickerLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-6 text-[12px] text-ink-3">
      <span className="size-3.5 rounded-full border-[1.5px] border-line-strong border-t-ink-2 [animation:spin_700ms_linear_infinite]" />
      <span className="loop-shimmer">{label}</span>
    </div>
  )
}

function PickerError({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-4 text-[11.5px] text-destructive">
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          aria-label="Retry loading events"
          className="grid size-7 place-items-center rounded-control hover:bg-destructive/10"
        >
          <RefreshCwIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

function PickerEmpty({ label }: { label: string }) {
  return <p className="px-3 py-6 text-center text-[12px] text-ink-3">{label}</p>
}

function ConnectSource({ label }: { label: string }) {
  return (
    <div className="px-3 py-5 text-center">
      <p className="text-[12px] text-ink-3">{label}</p>
      <a
        href="/auth/google"
        className="mt-2 inline-flex h-7 items-center rounded-control bg-ink px-3 text-[11.5px] font-medium text-canvas"
      >
        Connect Google
      </a>
    </div>
  )
}