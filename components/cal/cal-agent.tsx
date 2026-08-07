"use client"

import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai"
import { format, isSameDay } from "date-fns"
import {
  CalendarClockIcon,
  CalendarIcon,
  CalendarRangeIcon,
  CalendarSearchIcon,
  ChartColumnIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CopyIcon,
  LayersIcon,
  ListIcon,
  type LucideIcon,
  MailIcon,
  MailOpenIcon,
  MessagesSquareIcon,
  PanelRightCloseIcon,
  PenSquareIcon,
  RefreshCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Streamdown } from "streamdown"

import { ChatInput } from "@/components/chat/chat-input"
import { useSmoothText } from "@/components/chat/use-smooth-text"
import { LoopMark } from "@/components/loop-logo"
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
} from "@/components/cal/agent/proposed-change"
import type { CalendarEvent } from "@/components/event-calendar/types"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { usePersistentState } from "@/hooks/use-persistent-state"
import type {
  AgentDraft,
  AgentEmail,
  AgentThreadMessage,
  AgentEvent,
  AvailabilityCheck as AvailabilityData,
  CalendarStats,
  CalendarView,
  CalendarViewData,
  FreeSlot,
} from "@/lib/cal-agent/tools"
import { cn } from "@/lib/utils"

/** Output shapes of the tools. */
type SearchOutput = {
  count: number
  events: AgentEvent[]
  connected: boolean
  error?: string
}
type StatsOutput = { stats?: CalendarStats; connected: boolean; error?: string }
type ListOutput = {
  count: number
  events: AgentEvent[]
  connected: boolean
  error?: string
}
type SlotsOutput = {
  slots: FreeSlot[]
  durationMinutes: number
  connected: boolean
  hasOffHours?: boolean
  error?: string
}
type CalendarOutput = CalendarViewData
type AvailabilityOutput = AvailabilityData
type EmailListOutput = {
  count: number
  emails: AgentEmail[]
  connected: boolean
  unreadOnly: boolean
  query?: string
  error?: string
}

/** A calendar event attached to a message as context (dragged onto the panel). */
export type ContextEvent = {
  id: string
  title: string
  start: string
  end: string
  allDay?: boolean
  location?: string
  color?: string
}

/** A lightweight, serializable email attached to a message as context. */
export type ContextEmail = {
  id: string
  threadId: string
  from: string
  subject: string
  /** ISO datetime. */
  date: string
  snippet: string
}

/** Widen a context email back to the agent email shape for opening it. */
function contextEmailToAgentEmail(email: ContextEmail): AgentEmail {
  return {
    id: email.id,
    threadId: email.threadId,
    from: email.from,
    fromEmail: "",
    subject: email.subject,
    snippet: email.snippet,
    date: email.date,
    unread: false,
    important: false,
    starred: false,
    category: null,
  }
}

const COLOR_TINT: Record<string, string> = {
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
}

/** Convert a full calendar event to the lightweight, serializable context shape. */
export function toContextEvent(event: CalendarEvent): ContextEvent {
  return {
    id: event.id,
    title: event.title || "(untitled)",
    start: new Date(event.start).toISOString(),
    end: new Date(event.end).toISOString(),
    allDay: event.allDay,
    location: event.location,
    color: event.color,
  }
}

/** Short label for a context event's date/time (e.g. "Mon, Jul 14 · 2:00 PM"). */
function contextEventWhen(event: ContextEvent): string {
  const start = new Date(event.start)
  if (Number.isNaN(start.getTime())) return ""
  if (event.allDay) return `All day · ${format(start, "EEE, MMM d")}`
  return format(start, "EEE, MMM d · h:mm a")
}

/** Full start–end range for a context event's hover details. */
function contextEventRange(event: ContextEvent): string {
  const start = new Date(event.start)
  const end = new Date(event.end)
  if (Number.isNaN(start.getTime())) return ""
  if (event.allDay) return `All day · ${format(start, "EEEE, MMMM d")}`
  const startLabel = format(start, "EEEE, MMMM d · h:mm a")
  if (Number.isNaN(end.getTime())) return startLabel
  const endLabel = isSameDay(start, end)
    ? format(end, "h:mm a")
    : format(end, "EEEE, MMMM d · h:mm a")
  return `${startLabel} – ${endLabel}`
}

/** Widen a context event back to the agent event shape for opening it. */
function contextEventToAgentEvent(event: ContextEvent): AgentEvent {
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay ?? false,
    location: event.location ?? null,
    description: null,
    color: event.color ?? null,
    recurringEventId: null,
    originalStart: null,
  }
}

const SUGGESTIONS = [
  "What events do I have this week?",
  "Find my meetings with the design team",
  "Do I have any interviews coming up?",
]

const AGENT_NAME = "Loop Agent"

// Turn keys we've already tried to resume, so a remount / React double-invoke
// never fires a second overlapping reconnect on the same (registry-cached) Chat
// instance — overlapping resumes trip an SDK finally-block bug. Keyed by
// conversation + the interrupted user message id, so a genuinely new interrupted
// turn can still resume.
const resumedTurns = new Set<string>()

export function CalAgent({
  conversationId,
  initialMessages,
  onPersist,
  onNewChat,
  onClose,
  onOpenEvent,
  onOpenEmail,
  onMutated,
  contextEvents = [],
  onRemoveContextEvent,
  onClearContextEvents,
  contextEmails = [],
  onRemoveContextEmail,
  onClearContextEmails,
  tabBar,
  renderEmptyState,
  headerLeading,
}: {
  /** Stable id for this conversation; enables resuming an in-flight stream. */
  conversationId?: string
  /** Restored history to seed the chat with (parent remounts to switch). */
  initialMessages?: UIMessage[]
  /** Called with the full history once a turn completes (for persistence). */
  onPersist?: (messages: UIMessage[]) => void
  /** Start a fresh chat (renders a header button when provided). */
  onNewChat?: () => void
  /** Collapse the panel (renders a header button when provided). */
  onClose?: () => void
  /** Open an event inline. When omitted, clicking navigates to /cal. */
  onOpenEvent?: (event: AgentEvent) => void
  /** Open an email inline (used by the mail copilot). When omitted, email cards link to Gmail. */
  onOpenEmail?: (email: AgentEmail) => void
  /** Fired when the agent successfully creates/updates/deletes an event. */
  onMutated?: (action: WriteAction, event?: AgentEvent) => void
  /** Events dragged onto the panel, pending attachment to the next message. */
  contextEvents?: ContextEvent[]
  /** Remove one pending context event. */
  onRemoveContextEvent?: (id: string) => void
  /** Clear all pending context events (called after a message is sent). */
  onClearContextEvents?: () => void
  /** Emails attached from the reader, pending attachment to the next message. */
  contextEmails?: ContextEmail[]
  /** Remove one pending context email. */
  onRemoveContextEmail?: (id: string) => void
  /** Clear all pending context emails (called after a message is sent). */
  onClearContextEmails?: () => void
  /** Optional conversation switcher rendered under the header. */
  tabBar?: React.ReactNode
  /** Custom empty state; receives a helper to send a prompt. */
  renderEmptyState?: (onAsk: (text: string) => void) => React.ReactNode
  /** Optional content rendered in the header in place of the title (e.g. a mode toggle). */
  headerLeading?: React.ReactNode
}) {
  const router = useRouter()

  // Auto-approve mode: when on, mutating tools (create/update/delete) run without
  // a per-action confirmation. Persisted across reloads.
  const [autoApprove, setAutoApprove] = usePersistentState(
    "loop:agent:auto-approve",
    false
  )

  const {
    messages,
    sendMessage,
    status,
    stop,
    addToolApprovalResponse,
    regenerate,
    error,
    resumeStream,
  } = useChat({
    id: conversationId,
    messages: initialMessages,
    // Rebuilt when auto-approve toggles; the flag (and timezone) ride along in
    // the body of every request, including the SDK's internal post-approval send.
    transport: useMemo(
      () =>
        new DefaultChatTransport({
          api: "/api/cal-agent",
          body: {
            timezone:
              typeof Intl !== "undefined"
                ? Intl.DateTimeFormat().resolvedOptions().timeZone
                : undefined,
            autoApprove,
          },
        }),
      [autoApprove]
    ),
    // Resume generation after the user approves/rejects a tool.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  })

  const isStreaming = status === "submitted" || status === "streaming"

  // Send a message, attaching any pending event context as metadata (rendered
  // above the user bubble and injected into the model prompt server-side).
  const handleSend = useCallback(
    (text: string) => {
      const metadata:
        | { contextEvents?: ContextEvent[]; contextEmails?: ContextEmail[] }
        | undefined =
        contextEvents.length || contextEmails.length
          ? {
              ...(contextEvents.length ? { contextEvents } : {}),
              ...(contextEmails.length ? { contextEmails } : {}),
            }
          : undefined
      sendMessage({ text, metadata })
      onClearContextEvents?.()
      onClearContextEmails?.()
    },
    [
      sendMessage,
      contextEvents,
      contextEmails,
      onClearContextEvents,
      onClearContextEmails,
    ]
  )

  // True once a turn has streamed in THIS session. Resume is ONLY for recovering
  // a turn that was already in flight when the page loaded; once the live chat
  // has driven a turn, firing resumeStream() would reconnect to and replay the
  // active stream — overlapping generation, flipping status away from "ready",
  // and making the post-approval follow-up send get skipped (stuck "Applying…").
  // Set in an effect (not during render) so it never trips the refs lint.
  const sessionStartedRef = useRef(false)
  useEffect(() => {
    if (isStreaming) sessionStartedRef.current = true
  }, [isStreaming])

  // Resume an interrupted turn's stream exactly once. We drive this manually
  // (instead of useChat's automatic `resume`) and dedupe per turn so a remount
  // or React's double-invoke can't fire overlapping reconnects on the shared
  // Chat instance — which would trip an SDK bug. Only when the last saved
  // message is the user's (a reply was in flight when we left), only while idle,
  // and never once this session has streamed a turn of its own (the live chat
  // owns the stream from then on).
  useEffect(() => {
    if (sessionStartedRef.current) return
    if (status !== "ready") return
    const last = initialMessages?.at(-1)
    if (!conversationId || last?.role !== "user") return
    const turnKey = `${conversationId}:${last.id}`
    if (resumedTurns.has(turnKey)) return
    resumedTurns.add(turnKey)
    void resumeStream()
  }, [conversationId, initialMessages, resumeStream, status])

  const approve = useCallback(
    (id: string) => addToolApprovalResponse({ id, approved: true }),
    [addToolApprovalResponse]
  )
  const reject = useCallback(
    (id: string) => addToolApprovalResponse({ id, approved: false }),
    [addToolApprovalResponse]
  )

  // Safety net for a stuck "Applying…". The SDK only fires the follow-up send
  // (that runs the approved tool) if the chat is idle at click time; approving
  // before the stream fully closes makes it skip the send and never retry, so
  // the tool sits in `approval-responded` forever. When we detect that idle-but-
  // complete state, nudge the continuation once. The delay lets the SDK's own
  // send win in the normal case (it flips status away from "ready", clearing the
  // timer), so we only ever re-trigger a genuinely skipped send — never a
  // duplicate.
  const nudgedApprovalRef = useRef<string | null>(null)
  useEffect(() => {
    if (status !== "ready") return
    const last = messages.at(-1)
    if (last?.role !== "assistant") return
    if (!lastAssistantMessageIsCompleteWithApprovalResponses({ messages }))
      return
    const respondedId = last.parts
      ?.map((p) => p as { state?: string; approval?: { id?: string } })
      .find((p) => p.state === "approval-responded" && p.approval?.id)
      ?.approval?.id
    if (!respondedId) return
    const key = `${last.id}:${respondedId}`
    if (nudgedApprovalRef.current === key) return
    const timer = setTimeout(() => {
      nudgedApprovalRef.current = key
      addToolApprovalResponse({ id: respondedId, approved: true })
    }, 700)
    return () => clearTimeout(timer)
  }, [status, messages, addToolApprovalResponse])

  // Tell the parent when a mutating tool succeeds, so the calendar can refresh.
  const mutatedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const m of messages) {
      for (const p of m.parts ?? []) {
        const type = (p as { type?: string }).type
        if (
          type !== "tool-createEvent" &&
          type !== "tool-updateEvent" &&
          type !== "tool-deleteEvent"
        )
          continue
        const tp = p as {
          state?: string
          toolCallId?: string
          output?: { ok?: boolean; event?: AgentEvent }
        }
        if (
          tp.state === "output-available" &&
          tp.output?.ok &&
          tp.toolCallId &&
          !mutatedRef.current.has(tp.toolCallId)
        ) {
          mutatedRef.current.add(tp.toolCallId)
          const action: WriteAction =
            type === "tool-createEvent"
              ? "create"
              : type === "tool-updateEvent"
                ? "update"
                : "delete"
          onMutated?.(action, tp.output.event)
        }
      }
    }
  }, [messages, onMutated])

  // Persist a completed turn (tool parts have outputs); skip while awaiting approval.
  const prevStatus = useRef(status)
  useEffect(() => {
    // `approval-requested` is a stable pause (the tool carries its signed
    // approval id and is waiting for the user), so we DO persist it — that way a
    // remount seeds the approval part directly and Approve works immediately,
    // instead of relying on a stream replay to rebuild it. Only skip while
    // `approval-responded`, which is transient (the follow-up send that runs the
    // tool is about to fire) and would otherwise store a mid-execution state.
    const midApproval = messages.some((m) =>
      m.parts?.some(
        (p) =>
          typeof p === "object" &&
          p !== null &&
          "state" in p &&
          p.state === "approval-responded"
      )
    )
    if (
      prevStatus.current !== "ready" &&
      status === "ready" &&
      messages.length > 0 &&
      !midApproval
    ) {
      onPersist?.(messages)
    }
    prevStatus.current = status
  }, [status, messages, onPersist])

  // Persist the user's message immediately so a refresh keeps it. Guarded to fire
  // once per message — persist changes store state, so an unguarded call loops.
  const persistedUserMsgRef = useRef<string | null>(null)
  useEffect(() => {
    if (status !== "submitted" && status !== "streaming") return
    const last = messages.at(-1)
    if (last?.role === "user" && persistedUserMsgRef.current !== last.id) {
      persistedUserMsgRef.current = last.id
      onPersist?.(messages)
    }
  }, [status, messages, onPersist])

  // Follow-up suggestions: once a turn finishes, ask a small model to predict the
  // user's 3 most likely next messages and show them as chips above the composer.
  // Best-effort; keyed by the assistant message id so we fetch once per reply and
  // the chips auto-hide as soon as a newer message becomes the last one.
  const [suggest, setSuggest] = useState<{ id: string; items: string[] } | null>(
    null
  )
  const suggestFetchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (status !== "ready") return
    const last = messages.at(-1)
    if (!last || last.role !== "assistant") return
    // Not really "done" while a tool is awaiting (or just got) approval.
    const midApproval = last.parts?.some(
      (p) =>
        typeof p === "object" &&
        p !== null &&
        "state" in p &&
        ((p as { state?: string }).state === "approval-requested" ||
          (p as { state?: string }).state === "approval-responded")
    )
    if (midApproval) return
    if (!assistantText(last).trim()) return
    if (suggestFetchedRef.current === last.id) return
    suggestFetchedRef.current = last.id

    const controller = new AbortController()
    fetch("/api/cal-agent/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        timezone:
          typeof Intl !== "undefined"
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : undefined,
      }),
    })
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((data: { suggestions?: unknown }) => {
        const items = Array.isArray(data.suggestions)
          ? data.suggestions
              .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
              .slice(0, 3)
          : []
        if (items.length) setSuggest({ id: last.id, items })
      })
      .catch(() => {
        // best-effort; ignore aborts and failures
      })
    return () => controller.abort()
  }, [status, messages])

  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  /** Whether the view is pinned to the bottom (auto-scroll on new content). */
  const stickToBottomRef = useRef(true)
  const lastMessageId = messages.at(-1)?.id
  const isEmpty = messages.length === 0

  // Unpin auto-scroll once the user scrolls up.
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distanceFromBottom < 80
  }

  // Re-pin to the bottom on a new message.
  useEffect(() => {
    stickToBottomRef.current = true
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lastMessageId])

  // Keep pinned to the bottom as streamed content grows.
  useEffect(() => {
    const content = contentRef.current
    const el = scrollRef.current
    if (!content || !el) return
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [isEmpty])

  const handleOpenEvent = useCallback(
    (event: AgentEvent) => {
      if (onOpenEvent) {
        onOpenEvent(event)
        return
      }
      const params = new URLSearchParams({ event: event.id, date: event.start })
      router.push(`/cal?${params.toString()}`)
    },
    [onOpenEvent, router]
  )

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div className="flex min-w-0 items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Collapse panel"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PanelRightCloseIcon className="size-4" />
            </button>
          )}
          {headerLeading ?? (
            <h1 className="min-w-0 truncate text-[13px] font-medium text-foreground">
              Loop assistant
            </h1>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setAutoApprove((v) => !v)}
            aria-pressed={autoApprove}
            title={
              autoApprove
                ? "Auto-approve is ON — the agent applies calendar changes without asking"
                : "Auto-approve is OFF — you confirm each calendar change"
            }
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors",
              autoApprove
                ? "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <ZapIcon
              className={cn("size-3.5", autoApprove && "fill-current")}
            />
            Auto
          </button>
          {onNewChat && (
            <button
              type="button"
              onClick={onNewChat}
              aria-label="New chat"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PenSquareIcon className="size-4" />
            </button>
          )}
        </div>
      </header>

      {tabBar}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {isEmpty ? (
          renderEmptyState ? (
            <div className="mx-auto w-full max-w-2xl px-4 py-6">
              {renderEmptyState((text) => sendMessage({ text }))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <span className="grid size-10 place-items-center rounded-xl bg-foreground text-background">
                <SparklesIcon className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Ask about your calendar
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Search events and get quick answers.
                </p>
              </div>
              <div className="flex w-full flex-col gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendMessage({ text: s })}
                    className="rounded-lg border border-border/70 bg-background px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )
        ) : (
          <div
            ref={contentRef}
            className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6"
          >
            {messages.map((message, mi) => (
              <MessageView
                key={message.id || `msg-${mi}`}
                message={message}
                streaming={isStreaming && mi === messages.length - 1}
                isLast={mi === messages.length - 1}
                onOpenEvent={handleOpenEvent}
                onOpenEmail={onOpenEmail}
                onPickSlot={(slot) =>
                  sendMessage({ text: formatSlotSelection(slot) })
                }
                onApprove={approve}
                onReject={reject}
                onRegenerate={() => regenerate()}
              />
            ))}
            {isStreaming && messages.at(-1)?.role === "user" && (
              <AgentRow>
                <ThinkingDots />
              </AgentRow>
            )}
          </div>
        )}
      </div>

      {error && !isStreaming && (
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 pb-2 text-[13px] text-destructive">
          <TriangleAlertIcon className="size-4 shrink-0" />
          <span className="flex-1">Something went wrong.</span>
          <button
            type="button"
            onClick={() => regenerate()}
            className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <RefreshCwIcon className="size-3.5" />
            Retry
          </button>
        </div>
      )}

      {contextEvents.length > 0 && (
        <div className="mx-auto w-full max-w-2xl px-4 pt-3 pb-1.5">
          <div className="w-64 max-w-full">
            <ContextEventStack
              events={contextEvents}
              onOpen={(event) =>
                handleOpenEvent(contextEventToAgentEvent(event))
              }
              onRemove={onRemoveContextEvent}
            />
          </div>
        </div>
      )}

      {contextEmails.length > 0 && (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-1.5 px-4 pt-3 pb-1.5">
          {contextEmails.map((email) => (
            <ContextEmailChip
              key={email.id}
              email={email}
              onOpen={
                onOpenEmail
                  ? () => onOpenEmail(contextEmailToAgentEmail(email))
                  : undefined
              }
              onRemove={
                onRemoveContextEmail
                  ? () => onRemoveContextEmail(email.id)
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {suggest &&
        suggest.id === messages.at(-1)?.id &&
        !isStreaming &&
        !error && (
          <FollowUpSuggestions
            items={suggest.items}
            onPick={(text) => sendMessage({ text })}
          />
        )}

      <ChatInput
        isStreaming={isStreaming}
        onSend={handleSend}
        onStop={stop}
      />
    </div>
  )
}

function MessageView({
  message,
  streaming,
  isLast,
  onOpenEvent,
  onOpenEmail,
  onPickSlot,
  onApprove,
  onReject,
  onRegenerate,
}: {
  message: ReturnType<typeof useChat>["messages"][number]
  streaming?: boolean
  isLast?: boolean
  onOpenEvent?: (event: AgentEvent) => void
  onOpenEmail?: (email: AgentEmail) => void
  onPickSlot?: (slot: FreeSlot) => void
  onApprove?: (approvalId: string) => void
  onReject?: (approvalId: string) => void
  onRegenerate?: () => void
}) {
  if (message.role === "user") {
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("")
    const contextEvents =
      (message.metadata as { contextEvents?: ContextEvent[] } | undefined)
        ?.contextEvents ?? []
    const contextEmails =
      (message.metadata as { contextEmails?: ContextEmail[] } | undefined)
        ?.contextEmails ?? []
    return (
      <div className="flex flex-col items-end gap-1.5">
        {contextEvents.length > 0 && (
          <div className="w-64 max-w-[85%] pt-3">
            <ContextEventStack
              events={contextEvents}
              onOpen={
                onOpenEvent
                  ? (event) => onOpenEvent(contextEventToAgentEvent(event))
                  : undefined
              }
            />
          </div>
        )}
        {contextEmails.length > 0 && (
          <div className="flex w-72 max-w-[85%] flex-col gap-1.5 pt-3">
            {contextEmails.map((email) => (
              <ContextEmailChip
                key={email.id}
                email={email}
                onOpen={
                  onOpenEmail
                    ? () => onOpenEmail(contextEmailToAgentEmail(email))
                    : undefined
                }
              />
            ))}
          </div>
        )}
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-foreground">
          {text}
        </div>
      </div>
    )
  }

  return (
    <AgentRow>
      <div className="min-w-0 text-[15px] leading-relaxed text-foreground">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <AssistantText key={i} text={part.text} streaming={streaming} />
            )
          }

          if (part.type === "tool-searchEvents") {
            const toolPart = part as {
              state: string
              input?: { query?: string }
              output?: SearchOutput
            }
            const query = toolPart.input?.query ?? ""

            if (toolPart.state === "output-available" && toolPart.output) {
              const out = toolPart.output
              const card = (
                <EventSearchResults
                  query={query}
                  count={out.count}
                  events={out.events}
                  connected={out.connected}
                  error={out.error}
                  onOpenEvent={onOpenEvent}
                />
              )
              if (!out.connected || out.error)
                return <div key={i}>{card}</div>
              if (out.events.length === 0)
                return (
                  <ToolLine
                    key={i}
                    icon={CalendarSearchIcon}
                    summary={
                      query ? `No events for “${query}”` : "No events found"
                    }
                    count={0}
                  />
                )
              return (
                <ToolDisclosure
                  key={i}
                  icon={CalendarSearchIcon}
                  summary={query ? `Search · “${query}”` : "Event search"}
                  count={out.count}
                >
                  {card}
                </ToolDisclosure>
              )
            }

            return (
              <ToolActivity
                key={i}
                icon={CalendarSearchIcon}
                label={`Searching${query ? ` for “${query}”` : ""}…`}
              />
            )
          }

          if (part.type === "tool-calendarStats") {
            const toolPart = part as { state: string; output?: StatsOutput }

            if (toolPart.state === "output-available" && toolPart.output) {
              return (
                <CalendarStatsCard
                  key={i}
                  stats={toolPart.output.stats}
                  connected={toolPart.output.connected}
                  error={toolPart.output.error}
                />
              )
            }

            return (
              <ToolActivity
                key={i}
                icon={ChartColumnIcon}
                label="Analyzing your schedule…"
              />
            )
          }

          if (part.type === "tool-listEvents") {
            const toolPart = part as { state: string; output?: ListOutput }
            if (toolPart.state === "output-available" && toolPart.output) {
              const out = toolPart.output
              const card = (
                <AgendaList
                  events={out.events}
                  connected={out.connected}
                  error={out.error}
                  onOpenEvent={onOpenEvent}
                />
              )
              if (!out.connected || out.error)
                return <div key={i}>{card}</div>
              if (out.events.length === 0)
                return (
                  <ToolLine
                    key={i}
                    icon={ListIcon}
                    summary="Nothing scheduled"
                    count={0}
                  />
                )
              return (
                <ToolDisclosure
                  key={i}
                  icon={ListIcon}
                  summary="Agenda"
                  count={out.events.length}
                >
                  {card}
                </ToolDisclosure>
              )
            }
            return (
              <ToolActivity
                key={i}
                icon={ListIcon}
                label="Loading your agenda…"
              />
            )
          }

          if (part.type === "tool-getEventById") {
            const toolPart = part as {
              state: string
              output?: { event?: AgentEvent; error?: string }
            }
            if (toolPart.state === "output-available") {
              return toolPart.output?.error ? (
                <div key={i} className="my-2 text-[12px] text-destructive">
                  Couldn&apos;t refresh that event: {toolPart.output.error}
                </div>
              ) : null
            }
            return (
              <ToolActivity key={i} icon={RefreshCwIcon} label="Refreshing event…" />
            )
          }

          if (part.type === "tool-checkAvailability") {
            const toolPart = part as {
              state: string
              output?: AvailabilityOutput
            }
            if (toolPart.state === "output-available" && toolPart.output) {
              return (
                <AvailabilityCheck
                  key={i}
                  result={toolPart.output}
                  onOpenEvent={onOpenEvent}
                />
              )
            }
            return (
              <ToolActivity key={i} icon={ClockIcon} label="Checking that time…" />
            )
          }

          if (part.type === "tool-showCalendar") {
            const toolPart = part as {
              state: string
              input?: { view?: CalendarView }
              output?: CalendarOutput
            }
            if (toolPart.state === "output-available" && toolPart.output) {
              const out = toolPart.output
              const card = (
                <MiniCalendar
                  view={out.view}
                  rangeStart={out.rangeStart}
                  rangeEnd={out.rangeEnd}
                  events={out.events}
                  connected={out.connected}
                  error={out.error}
                  onOpenEvent={onOpenEvent}
                />
              )
              if (!out.connected || out.error)
                return <div key={i}>{card}</div>
              return (
                <ToolDisclosure
                  key={i}
                  icon={CalendarRangeIcon}
                  summary={`${out.view.charAt(0).toUpperCase()}${out.view.slice(1)} calendar`}
                  count={out.events.length}
                  defaultOpen
                >
                  {card}
                </ToolDisclosure>
              )
            }
            return (
              <ToolActivity
                key={i}
                icon={CalendarRangeIcon}
                label={`Building your ${toolPart.input?.view ?? ""} calendar…`}
              />
            )
          }

          if (part.type === "tool-findFreeSlots") {
            const toolPart = part as { state: string; output?: SlotsOutput }
            if (toolPart.state === "output-available" && toolPart.output) {
              const out = toolPart.output
              const card = (
                <FreeSlots
                  slots={out.slots}
                  durationMinutes={out.durationMinutes}
                  connected={out.connected}
                  error={out.error}
                  onPick={onPickSlot}
                />
              )
              if (!out.connected || out.error)
                return <div key={i}>{card}</div>
              if (out.slots.length === 0)
                return (
                  <ToolLine
                    key={i}
                    icon={CalendarClockIcon}
                    summary="No open slots found"
                    count={0}
                  />
                )
              return (
                <ToolDisclosure
                  key={i}
                  icon={CalendarClockIcon}
                  summary="Open time slots"
                  count={out.slots.length}
                  defaultOpen
                >
                  {card}
                </ToolDisclosure>
              )
            }
            return (
              <ToolActivity
                key={i}
                icon={CalendarClockIcon}
                label="Finding open time…"
              />
            )
          }

          if (part.type === "tool-listEmails") {
            const toolPart = part as {
              state: string
              input?: { unreadOnly?: boolean; maxResults?: number }
              output?: EmailListOutput
            }
            if (toolPart.state === "output-available" && toolPart.output) {
              const out = toolPart.output
              const card = (
                <EmailResults
                  emails={out.emails}
                  count={out.count}
                  connected={out.connected}
                  unreadOnly={out.unreadOnly}
                  query={out.query}
                  error={out.error}
                  onOpenEmail={onOpenEmail}
                />
              )
              if (!out.connected || out.error)
                return <div key={i}>{card}</div>
              if (out.emails.length === 0)
                return (
                  <ToolLine
                    key={i}
                    icon={MailIcon}
                    summary={
                      out.query
                        ? `No email for “${out.query}”`
                        : out.unreadOnly
                          ? "No unread email"
                          : "No email found"
                    }
                    count={0}
                  />
                )
              return (
                <ToolDisclosure
                  key={i}
                  icon={MailIcon}
                  summary={
                    out.query
                      ? `“${out.query}”`
                      : out.unreadOnly
                        ? "Unread email"
                        : "Inbox"
                  }
                  count={out.count}
                >
                  {card}
                </ToolDisclosure>
              )
            }
            return (
              <EmailResultsSkeleton
                key={i}
                label={
                  toolPart.input?.unreadOnly
                    ? "Checking for unread email…"
                    : "Fetching your inbox…"
                }
              />
            )
          }

          if (part.type === "tool-readEmail") {
            const toolPart = part as {
              state: string
              output?: {
                connected: boolean
                email?: AgentThreadMessage
                error?: string
              }
            }
            if (toolPart.state === "output-available" && toolPart.output) {
              return (
                <EmailDetailCard
                  key={i}
                  email={toolPart.output.email}
                  connected={toolPart.output.connected}
                  error={toolPart.output.error}
                  onOpenEmail={onOpenEmail}
                />
              )
            }
            return (
              <ToolActivity key={i} icon={MailOpenIcon} label="Opening the email…" />
            )
          }

          if (part.type === "tool-readThread") {
            const toolPart = part as {
              state: string
              output?: {
                connected: boolean
                count: number
                subject?: string
                messages: AgentThreadMessage[]
                error?: string
              }
            }
            if (toolPart.state === "output-available" && toolPart.output) {
              const out = toolPart.output
              const card = (
                <EmailThread
                  subject={out.subject}
                  messages={out.messages}
                  count={out.count}
                  connected={out.connected}
                  error={out.error}
                  onOpenEmail={onOpenEmail}
                />
              )
              if (!out.connected || out.error || out.messages.length === 0)
                return <div key={i}>{card}</div>
              return (
                <ToolDisclosure
                  key={i}
                  icon={MessagesSquareIcon}
                  summary={out.subject || "Conversation"}
                  count={out.count}
                >
                  {card}
                </ToolDisclosure>
              )
            }
            return (
              <ToolActivity
                key={i}
                icon={MessagesSquareIcon}
                label="Reading the conversation…"
              />
            )
          }

          if (part.type === "tool-draftReply") {
            const toolPart = part as {
              state: string
              output?: { draft: AgentDraft }
            }
            if (toolPart.state === "output-available" && toolPart.output) {
              return <EmailDraftCard key={i} draft={toolPart.output.draft} />
            }
            return (
              <ToolActivity key={i} icon={PenSquareIcon} label="Drafting a reply…" />
            )
          }

          if (
            part.type === "tool-createEvent" ||
            part.type === "tool-updateEvent" ||
            part.type === "tool-deleteEvent"
          ) {
            const action: WriteAction =
              part.type === "tool-createEvent"
                ? "create"
                : part.type === "tool-updateEvent"
                  ? "update"
                  : "delete"
            const toolPart = part as {
              state: string
              input?: {
                eventTitle?: string
                title?: string
                start?: string
                end?: string
                allDay?: boolean
                location?: string
                eventId?: string
                color?: string
                recurrence?: import("@/components/event-calendar/types").EventRecurrence
                recurrenceScope?: import("@/components/event-calendar/types").RecurrenceScope
              }
              output?: { ok: boolean; event?: AgentEvent; error?: string }
              approval?: { id: string }
            }
            const approvalId = toolPart.approval?.id
            return (
              <ProposedChange
                key={i}
                action={action}
                state={toolPart.state}
                input={toolPart.input ?? {}}
                output={toolPart.output}
                onApprove={
                  approvalId ? () => onApprove?.(approvalId) : undefined
                }
                onReject={approvalId ? () => onReject?.(approvalId) : undefined}
                onOpenEvent={onOpenEvent}
              />
            )
          }

          return null
        })}

        {!streaming && (
          <MessageActions
            text={assistantText(message)}
            onRegenerate={isLast ? onRegenerate : undefined}
          />
        )}
      </div>
    </AgentRow>
  )
}

function formatSlotSelection(slot: FreeSlot): string {
  const start = new Date(slot.start)
  const end = new Date(slot.end)
  const endLabel = isSameDay(start, end)
    ? format(end, "h:mm a")
    : format(end, "EEEE, MMMM d 'at' h:mm a")
  return `Use this slot: ${format(start, "EEEE, MMMM d 'from' h:mm a")} to ${endLabel}.`
}

/** Concatenate an assistant message's text parts. */
function assistantText(
  message: ReturnType<typeof useChat>["messages"][number]
): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("")
}

/** Hover actions under an assistant message: copy + (optionally) regenerate. */
function MessageActions({
  text,
  onRegenerate,
}: {
  text: string
  onRegenerate?: () => void
}) {
  const [copied, setCopied] = useState(false)

  if (!text && !onRegenerate) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {text && (
        <button
          type="button"
          onClick={copy}
          aria-label="Copy"
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </button>
      )}
      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          aria-label="Regenerate"
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCwIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/**
 * One attached calendar event as a clean row: a color icon, the title, and a
 * secondary "time · location" line. Clicking opens it; an optional remove button
 * sits on the right. Used as the single-event chip and as each row in the
 * expanded list.
 */
function ContextEventCard({
  event,
  onOpen,
  onRemove,
}: {
  event: ContextEvent
  onOpen?: () => void
  onRemove?: () => void
}) {
  const when = contextEventWhen(event)
  const meta = [when, event.location].filter(Boolean).join(" · ")
  const details =
    contextEventRange(event) + (event.location ? ` · ${event.location}` : "")
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        title={details}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-background py-2 pl-2 text-left shadow-sm transition-colors",
          onRemove ? "pr-9" : "pr-3",
          onOpen
            ? "cursor-pointer hover:border-border hover:bg-muted/50"
            : "cursor-default"
        )}
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            COLOR_TINT[event.color ?? "sky"] ?? COLOR_TINT.sky
          )}
        >
          <CalendarIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">
            {event.title}
          </p>
          {meta && (
            <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
          )}
        </div>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove context"
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

/**
 * Attached calendar events. One event renders inline as a single chip. Multiple
 * events collapse into a tidy stacked-card trigger that opens a portaled list on
 * hover or click. Because the list is portaled (via Popover) it is never clipped
 * by the chat scroll area — it always renders fully on screen and flips side to
 * stay in view. Each row is clickable to open, and removable while composing.
 */
function contextEmailWhen(email: ContextEmail): string {
  const d = new Date(email.date)
  if (Number.isNaN(d.getTime())) return ""
  return format(d, "EEE, MMM d")
}

function ContextEmailChip({
  email,
  onOpen,
  onRemove,
}: {
  email: ContextEmail
  onOpen?: () => void
  onRemove?: () => void
}) {
  const when = contextEmailWhen(email)
  return (
    <div className="relative flex items-center gap-2.5 rounded-xl border border-border/70 bg-background py-2 pr-2 pl-2 shadow-sm transition-colors hover:border-border hover:bg-muted/50">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
        <MailIcon className="size-4" />
      </span>
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <p className="truncate text-[13px] font-medium text-foreground">
          {email.subject || "(no subject)"}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {email.from}
          {when ? ` · ${when}` : ""}
        </p>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove attached email"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

function ContextEventStack({
  events,
  onOpen,
  onRemove,
}: {
  events: ContextEvent[]
  onOpen?: (event: ContextEvent) => void
  onRemove?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])
  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 160)
  }, [cancelClose])
  useEffect(() => cancelClose, [cancelClose])

  if (events.length === 0) return null

  if (events.length === 1) {
    const event = events[0]
    return (
      <ContextEventCard
        event={event}
        onOpen={onOpen ? () => onOpen(event) : undefined}
        onRemove={onRemove ? () => onRemove(event.id) : undefined}
      />
    )
  }

  const first = events[0]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${events.length} attached events`}
          onMouseEnter={() => {
            cancelClose()
            setOpen(true)
          }}
          onMouseLeave={scheduleClose}
          className="group/stack relative block w-full text-left"
        >
          {/* Stacked-paper layers peeking above the lead card signal there are
           * more; they never peek below it, so the stack reads cleanly. */}
          <span
            aria-hidden
            className="absolute inset-x-7 -top-3 h-full rounded-xl border border-border/50 bg-muted/40 shadow-sm transition-transform duration-200 group-hover/stack:-translate-y-1"
          />
          <span
            aria-hidden
            className="absolute inset-x-3.5 -top-1.5 h-full rounded-xl border border-border/60 bg-muted/20 shadow-sm transition-transform duration-200 group-hover/stack:-translate-y-0.5"
          />
          <div className="relative flex items-center gap-2.5 rounded-xl border border-border/70 bg-background py-2 pr-2 pl-2 shadow-sm transition-colors group-hover/stack:border-border group-hover/stack:bg-muted/50">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg",
                COLOR_TINT[first.color ?? "sky"] ?? COLOR_TINT.sky
              )}
            >
              <CalendarIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">
                {first.title}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {contextEventWhen(first)}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              <LayersIcon className="size-3" />
              {events.length}
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        className="w-72 overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <LayersIcon className="size-3.5 text-muted-foreground" />
          <p className="text-[12px] font-medium text-foreground">
            {events.length} attached events
          </p>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto p-1.5">
          {events.map((event) => (
            <ContextEventCard
              key={event.id}
              event={event}
              onOpen={onOpen ? () => onOpen(event) : undefined}
              onRemove={onRemove ? () => onRemove(event.id) : undefined}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function AgentAvatar() {
  return (
    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-foreground text-background">
      <LoopMark className="h-4 w-[13px]" />
    </span>
  )
}

/** Assistant message row: avatar + name, with the content beside it. */
/**
 * Predicted follow-up messages, shown as horizontally scrollable chips above
 * the composer once a turn finishes. Ordered most-likely first (leftmost).
 */
function FollowUpSuggestions({
  items,
  onPick,
}: {
  items: string[]
  onPick: (text: string) => void
}) {
  if (!items.length) return null
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-2 pb-1">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((s, i) => (
          <button
            key={`${i}-${s}`}
            type="button"
            onClick={() => onPick(s)}
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1.5 text-[13px] text-foreground/80 transition-colors hover:border-ring/50 hover:bg-muted/60 hover:text-foreground"
          >
            <span className="whitespace-nowrap">{s}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function AgentRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="group flex gap-3">
      <AgentAvatar />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[13px] font-medium text-foreground">
          {AGENT_NAME}
        </p>
        {children}
      </div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div
      className="flex items-center gap-1 py-1"
      aria-label="Assistant is thinking"
    >
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
    </div>
  )
}

/**
 * A single running tool step: an icon tile with a soft breathing halo and a
 * shimmering label. Used as the pending state for every tool so the agent's
 * work reads as a clean, consistent activity feed while it streams.
 */
function ToolActivity({
  icon: Icon,
  label,
}: {
  icon: LucideIcon
  label: string
}) {
  return (
    <div className="my-2 flex items-center gap-2.5" aria-live="polite">
      <span className="relative grid size-6 shrink-0 place-items-center rounded-lg bg-muted text-foreground/80 ring-1 ring-inset ring-border/60">
        <span className="loop-halo absolute inset-0 rounded-lg bg-foreground/10" />
        <Icon className="relative size-3.5" />
      </span>
      <span className="loop-shimmer text-[13px] font-medium">{label}</span>
    </div>
  )
}

/**
 * A single quiet summary line for a tool result that has nothing to expand
 * (e.g. an empty search). Reads as unobtrusive metadata in the transcript.
 */
function ToolLine({
  icon: Icon,
  summary,
  count,
}: {
  icon: LucideIcon
  summary: React.ReactNode
  count?: number
}) {
  return (
    <div className="my-1 flex items-center gap-2 px-1 py-0.5 text-muted-foreground">
      <Icon className="size-3.5 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate text-[12.5px]">{summary}</span>
      {typeof count === "number" && (
        <span className="shrink-0 text-[11px] tabular-nums opacity-70">
          {count}
        </span>
      )}
    </div>
  )
}

/**
 * Light accordion around a completed tool result. Collapsed by default so the
 * transcript stays clean and minimal — the agent's written answer carries the
 * summary, and the underlying sources (event lists, inboxes, calendars) sit
 * quietly behind a one-line toggle the user can open if they want the detail.
 */
function ToolDisclosure({
  icon: Icon,
  summary,
  count,
  defaultOpen = false,
  children,
}: {
  icon: LucideIcon
  summary: React.ReactNode
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left text-muted-foreground transition-colors hover:text-foreground"
      >
        <Icon className="size-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
        <span className="min-w-0 flex-1 truncate text-[12.5px]">{summary}</span>
        {typeof count === "number" && (
          <span className="shrink-0 text-[11px] tabular-nums opacity-70">
            {count}
          </span>
        )}
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 opacity-50 transition-all duration-200 group-hover:opacity-100",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="mt-0.5 ml-[7px] border-l border-border/50 pl-3">
          {children}
        </div>
      )}
    </div>
  )
}



/** Assistant markdown; text is smoothed while streaming so it reads as a steady flow. */
function AssistantText({
  text,
  streaming,
}: {
  text: string
  streaming?: boolean
}) {
  const smoothed = useSmoothText(text, Boolean(streaming))
  if (!smoothed) return null
  return (
    <Streamdown className="loop-markdown break-words" animated={false}>
      {smoothed}
    </Streamdown>
  )
}
