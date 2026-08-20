"use client"

import { format, isSameDay } from "date-fns"
import {
  CalendarDaysIcon,
  FileTextIcon,
  MailIcon,
  MapPinIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react"
import { useDeferredValue, useEffect, useMemo, useState } from "react"

import { parseAddress } from "@/components/email/utils"
import type { CalendarEvent } from "@/components/event-calendar/types"
import { Input } from "@/components/ui/input"
import { listEmails, type Email } from "@/lib/api/emails"
import { fetchDocuments } from "@/lib/api/documents"
import { syncEvents } from "@/lib/api/events"
import {
  agentContextItemKey,
  type AgentContextItem,
} from "@/lib/agent-context"
import type { DocumentSummary } from "@/lib/documents"
import { cn } from "@/lib/utils"

type ContextTab = "calendar" | "email" | "documents"

export function AgentContextPicker({
  attached,
  onAttach,
}: {
  attached: AgentContextItem[]
  onAttach: (item: AgentContextItem) => void
}) {
  const [tab, setTab] = useState<ContextTab>("calendar")
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
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null)
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const attachedKeys = useMemo(
    () => new Set(attached.map(agentContextItemKey)),
    [attached]
  )

  useEffect(() => {
    if (tab !== "calendar" || events !== null) return
    let cancelled = false
    const now = new Date()
    const startDate = new Date(now)
    const endDate = new Date(now)
    startDate.setDate(startDate.getDate() - 30)
    endDate.setDate(endDate.getDate() + 90)
    syncEvents({ startDate, endDate })
      .then((result) => {
        if (cancelled) return
        setEvents(sortEvents(result.events, now.getTime()))
        setEventsConnected(result.connected)
        setEventsError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setEvents([])
        setEventsError(error instanceof Error ? error.message : "Failed to load events")
      })
      .finally(() => {
        if (!cancelled) setEventsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [events, tab])

  useEffect(() => {
    if (tab !== "email") return
    let cancelled = false
    const timer = window.setTimeout(() => {
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
          if (cancelled) return
          setEmails([])
          setEmailsError(error instanceof Error ? error.message : "Failed to load email")
        })
        .finally(() => {
          if (!cancelled) setEmailsLoading(false)
        })
    }, deferredSearch ? 300 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [deferredSearch, tab])

  useEffect(() => {
    if (tab !== "documents" || documents !== null) return
    let cancelled = false
    fetchDocuments({ allFolders: true, kind: "document" })
      .then((result) => {
        if (cancelled) return
        setDocuments(result)
        setDocumentsError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setDocuments([])
        setDocumentsError(
          error instanceof Error ? error.message : "Failed to load documents"
        )
      })
      .finally(() => {
        if (!cancelled) setDocumentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [documents, tab])

  const filteredEvents = useMemo(() => {
    const query = deferredSearch.toLowerCase()
    if (!query) return events ?? []
    return (events ?? []).filter((event) =>
      [event.title, event.location, event.description]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    )
  }, [deferredSearch, events])

  const filteredDocuments = useMemo(() => {
    const query = deferredSearch.toLowerCase()
    if (!query) return documents ?? []
    return (documents ?? []).filter((document) =>
      [document.title, ...document.preview.map((block) => block.text)]
        .join(" ")
        .toLowerCase()
        .includes(query)
    )
  }, [deferredSearch, documents])

  const attachEvent = (event: CalendarEvent) => {
    onAttach({
      type: "event",
      event: {
        id: event.id,
        title: event.title || "Untitled event",
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        allDay: event.allDay,
        location: event.location,
        color: event.color,
      },
    })
  }

  const attachEmail = (email: Email) => {
    onAttach({
      type: "email",
      email: {
        id: email.id,
        threadId: email.threadId,
        from: email.from,
        subject: email.subject,
        date: email.date,
        snippet: email.snippet,
      },
    })
  }

  const attachDocument = (document: DocumentSummary) => {
    onAttach({
      type: "document",
      document: {
        id: document.id,
        title: document.title || "Untitled document",
        updatedAt: document.updatedAt,
        preview: document.preview.map((block) => block.text).join(" ").slice(0, 360),
      },
    })
  }

  return (
    <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-[10px] bg-surface shadow-raised">
      <div className="border-b border-line p-2.5">
        <div className="grid grid-cols-3 gap-1 rounded-control bg-inset p-0.5 shadow-hairline">
          <TabButton active={tab === "calendar"} icon={CalendarDaysIcon} label="Calendar" onClick={() => changeTab("calendar", setTab, setSearch)} />
          <TabButton active={tab === "email"} icon={MailIcon} label="Email" onClick={() => changeTab("email", setTab, setSearch)} />
          <TabButton active={tab === "documents"} icon={FileTextIcon} label="Documents" onClick={() => changeTab("documents", setTab, setSearch)} />
        </div>
        <div className="relative mt-2">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${tab}`}
            className="h-8 pl-8 text-[12px]"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto p-1.5">
        {tab === "calendar" && (
          <SourceResults
            loading={eventsLoading}
            error={eventsError}
            connected={eventsConnected}
            empty={filteredEvents.length === 0}
            emptyLabel={deferredSearch ? "No matching events" : "No events found"}
            onRetry={() => {
              setEventsLoading(true)
              setEventsError(null)
              setEvents(null)
            }}
          >
            {filteredEvents.slice(0, 40).map((event) => {
              const key = `event:${event.id}`
              return (
                <ResultButton key={key} disabled={attachedKeys.has(key)} onClick={() => attachEvent(event)}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-control bg-accent-tint text-accent-ink">
                    <CalendarDaysIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-ink">{event.title || "Untitled event"}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-ink-3">{eventWhen(event)}</span>
                    {event.location && <span className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-ink-3"><MapPinIcon className="size-2.5 shrink-0" /> {event.location}</span>}
                  </span>
                  {attachedKeys.has(key) && <AttachedLabel />}
                </ResultButton>
              )
            })}
          </SourceResults>
        )}
        {tab === "email" && (
          <SourceResults
            loading={emailsLoading}
            error={emailsError}
            connected={emailsConnected}
            empty={emails.length === 0}
            emptyLabel={deferredSearch ? "No matching email" : "No email found"}
          >
            {emails.map((email) => {
              const key = `email:${email.id}`
              const sender = parseAddress(email.from)
              return (
                <ResultButton key={key} disabled={attachedKeys.has(key)} onClick={() => attachEmail(email)}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-inset text-[10px] font-semibold text-ink-2">{initials(sender.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-ink-3">{sender.name} · {formatDate(email.date)}</span>
                    <span className="mt-0.5 block truncate text-[12px] font-medium text-ink">{email.subject || "(no subject)"}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-ink-3">{email.snippet}</span>
                  </span>
                  {attachedKeys.has(key) && <AttachedLabel />}
                </ResultButton>
              )
            })}
          </SourceResults>
        )}
        {tab === "documents" && (
          <SourceResults
            loading={documentsLoading}
            error={documentsError}
            empty={filteredDocuments.length === 0}
            emptyLabel={deferredSearch ? "No matching documents" : "No documents found"}
          >
            {filteredDocuments.map((document) => {
              const key = `document:${document.id}`
              const preview = document.preview.map((block) => block.text).join(" ")
              return (
                <ResultButton key={key} disabled={attachedKeys.has(key)} onClick={() => attachDocument(document)}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-control bg-inset text-ink-2"><FileTextIcon className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-ink">{document.title || "Untitled document"}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-ink-3">{preview || `Updated ${formatDate(document.updatedAt)}`}</span>
                  </span>
                  {attachedKeys.has(key) && <AttachedLabel />}
                </ResultButton>
              )
            })}
          </SourceResults>
        )}
      </div>
    </div>
  )
}

function changeTab(
  tab: ContextTab,
  setTab: (tab: ContextTab) => void,
  setSearch: (search: string) => void
) {
  setTab(tab)
  setSearch("")
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof CalendarDaysIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-[6px] px-1 text-[11.5px] font-medium transition-colors", active ? "bg-surface text-ink shadow-btn" : "text-ink-3 hover:text-ink")}>
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function SourceResults({ loading, error, connected, empty, emptyLabel, onRetry, children }: { loading: boolean; error: string | null; connected?: boolean | null; empty: boolean; emptyLabel: string; onRetry?: () => void; children: React.ReactNode }) {
  if (loading) return <PickerStatus>Loading...</PickerStatus>
  if (error) return <PickerError message={error} onRetry={onRetry} />
  if (connected === false && empty) {
    return (
      <div className="px-3 py-5 text-center">
        <p className="text-[12px] text-ink-3">Connect Google to browse this source.</p>
        <a href="/auth/google" className="mt-2 inline-flex h-7 items-center rounded-control bg-ink px-3 text-[11.5px] font-medium text-canvas">Connect Google</a>
      </div>
    )
  }
  if (empty) return <PickerStatus>{emptyLabel}</PickerStatus>
  return <div className="flex flex-col">{children}</div>
}

function ResultButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-hover disabled:opacity-60">{children}</button>
}

function AttachedLabel() {
  return <span className="shrink-0 pt-1 text-[10px] font-medium text-accent-ink">Added</span>
}

function PickerStatus({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-[12px] text-ink-3">{children}</p>
}

function PickerError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-4 text-[11.5px] text-destructive">
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && <button type="button" onClick={onRetry} aria-label="Retry" className="grid size-7 place-items-center rounded-control hover:bg-destructive/10"><RefreshCwIcon className="size-3.5" /></button>}
    </div>
  )
}

function sortEvents(events: CalendarEvent[], now: number): CalendarEvent[] {
  return [...events].sort((left, right) => {
    const leftTime = left.start.getTime()
    const rightTime = right.start.getTime()
    const leftUpcoming = leftTime >= now
    const rightUpcoming = rightTime >= now
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1
    return leftUpcoming ? leftTime - rightTime : rightTime - leftTime
  })
}

function eventWhen(event: CalendarEvent): string {
  if (event.allDay) return `${format(event.start, "EEE, MMM d")} · All day`
  return isSameDay(event.start, event.end)
    ? `${format(event.start, "EEE, MMM d · h:mm a")} – ${format(event.end, "h:mm a")}`
    : `${format(event.start, "MMM d · h:mm a")} – ${format(event.end, "MMM d · h:mm a")}`
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : format(date, "MMM d")
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"
}