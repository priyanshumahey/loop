"use client"

import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai"
import {
  CheckIcon,
  CopyIcon,
  PanelRightCloseIcon,
  PenSquareIcon,
  RefreshCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Streamdown } from "streamdown"

import { ChatInput } from "@/components/chat/chat-input"
import { useSmoothText } from "@/components/chat/use-smooth-text"
import { LoopMark } from "@/components/loop-logo"
import { AgendaList } from "@/components/cal/agent/agenda-list"
import { CalendarStatsCard } from "@/components/cal/agent/calendar-stats-card"
import { EventSearchResults } from "@/components/cal/agent/event-search-results"
import { FreeSlots } from "@/components/cal/agent/free-slots"
import { MiniCalendar } from "@/components/cal/agent/mini-calendar"
import {
  ProposedChange,
  type WriteAction,
} from "@/components/cal/agent/proposed-change"
import { usePersistentState } from "@/hooks/use-persistent-state"
import type {
  AgentEvent,
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
  onMutated,
  tabBar,
  renderEmptyState,
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
  /** Fired when the agent successfully creates/updates/deletes an event. */
  onMutated?: (action: WriteAction, event?: AgentEvent) => void
  /** Optional conversation switcher rendered under the header. */
  tabBar?: React.ReactNode
  /** Custom empty state; receives a helper to send a prompt. */
  renderEmptyState?: (onAsk: (text: string) => void) => React.ReactNode
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
    if (!lastAssistantMessageIsCompleteWithApprovalResponses({ messages })) return
    const respondedId = last.parts
      ?.map((p) => p as { state?: string; approval?: { id?: string } })
      .find((p) => p.state === "approval-responded" && p.approval?.id)?.approval
      ?.id
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
          <h1 className="min-w-0 truncate text-[13px] font-medium text-foreground">
            Calendar assistant
          </h1>
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
                key={message.id}
                message={message}
                streaming={isStreaming && mi === messages.length - 1}
                isLast={mi === messages.length - 1}
                onOpenEvent={handleOpenEvent}
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

      <ChatInput
        isStreaming={isStreaming}
        onSend={(text) => sendMessage({ text })}
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
  onApprove,
  onReject,
  onRegenerate,
}: {
  message: ReturnType<typeof useChat>["messages"][number]
  streaming?: boolean
  isLast?: boolean
  onOpenEvent?: (event: AgentEvent) => void
  onApprove?: (approvalId: string) => void
  onReject?: (approvalId: string) => void
  onRegenerate?: () => void
}) {
  if (message.role === "user") {
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("")
    return (
      <div className="flex justify-end">
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
            return <AssistantText key={i} text={part.text} streaming={streaming} />
          }

          if (part.type === "tool-searchEvents") {
            const toolPart = part as {
              state: string
              input?: { query?: string }
              output?: SearchOutput
            }
            const query = toolPart.input?.query ?? ""

            if (toolPart.state === "output-available" && toolPart.output) {
              return (
                <EventSearchResults
                  key={i}
                  query={query}
                  count={toolPart.output.count}
                  events={toolPart.output.events}
                  connected={toolPart.output.connected}
                  error={toolPart.output.error}
                  onOpenEvent={onOpenEvent}
                />
              )
            }

            return (
              <div
                key={i}
                className="my-2 flex items-center gap-2 text-[12px] text-muted-foreground"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                Searching{query ? ` for “${query}”` : ""}…
              </div>
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
              <div
                key={i}
                className="my-2 flex items-center gap-2 text-[12px] text-muted-foreground"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                Analyzing your schedule…
              </div>
            )
          }

          if (part.type === "tool-listEvents") {
            const toolPart = part as { state: string; output?: ListOutput }
            if (toolPart.state === "output-available" && toolPart.output) {
              return (
                <AgendaList
                  key={i}
                  events={toolPart.output.events}
                  connected={toolPart.output.connected}
                  error={toolPart.output.error}
                  onOpenEvent={onOpenEvent}
                />
              )
            }
            return (
              <div
                key={i}
                className="my-2 flex items-center gap-2 text-[12px] text-muted-foreground"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                Loading your agenda…
              </div>
            )
          }

          if (part.type === "tool-showCalendar") {
            const toolPart = part as {
              state: string
              input?: { view?: CalendarView }
              output?: CalendarOutput
            }
            if (toolPart.state === "output-available" && toolPart.output) {
              return (
                <MiniCalendar
                  key={i}
                  view={toolPart.output.view}
                  rangeStart={toolPart.output.rangeStart}
                  rangeEnd={toolPart.output.rangeEnd}
                  events={toolPart.output.events}
                  connected={toolPart.output.connected}
                  error={toolPart.output.error}
                  onOpenEvent={onOpenEvent}
                />
              )
            }
            return (
              <div
                key={i}
                className="my-2 flex items-center gap-2 text-[12px] text-muted-foreground"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                Building your {toolPart.input?.view ?? ""} calendar…
              </div>
            )
          }

          if (part.type === "tool-findFreeSlots") {
            const toolPart = part as { state: string; output?: SlotsOutput }
            if (toolPart.state === "output-available" && toolPart.output) {
              return (
                <FreeSlots
                  key={i}
                  slots={toolPart.output.slots}
                  durationMinutes={toolPart.output.durationMinutes}
                  connected={toolPart.output.connected}
                  error={toolPart.output.error}
                />
              )
            }
            return (
              <div
                key={i}
                className="my-2 flex items-center gap-2 text-[12px] text-muted-foreground"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                Finding open time…
              </div>
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
                title?: string
                start?: string
                end?: string
                allDay?: boolean
                location?: string
                eventId?: string
                color?: string
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

function AgentAvatar() {
  return (
    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-foreground text-background">
      <LoopMark className="h-4 w-[13px]" />
    </span>
  )
}

/** Assistant message row: avatar + name, with the content beside it. */
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

/** Assistant markdown; text is smoothed while streaming so it reads as a steady flow. */
function AssistantText({ text, streaming }: { text: string; streaming?: boolean }) {
  const smoothed = useSmoothText(text, Boolean(streaming))
  if (!smoothed) return null
  return (
    <Streamdown className="loop-markdown break-words" animated={false}>
      {smoothed}
    </Streamdown>
  )
}
