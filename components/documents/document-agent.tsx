"use client"

import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai"
import {
  CalendarIcon,
  CheckIcon,
  CopyIcon,
  FilePlus2Icon,
  FileSearchIcon,
  FileTextIcon,
  MailIcon,
  PanelRightCloseIcon,
  QuoteIcon,
  RefreshCwIcon,
  Trash2Icon,
  WandSparklesIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Streamdown } from "streamdown"

import {
  AgentCard,
  AgentContextCard,
  FollowUpSuggestions,
  PromptBar,
  StarterPromptList,
} from "@/components/agent"
import { AgentTabs } from "@/components/cal/agent/agent-tabs"
import {
  isWorkspaceToolType,
  WorkspaceTool,
} from "@/components/agent/workspace-tool"
import { useSmoothText } from "@/components/chat/use-smooth-text"
import { LoopMark } from "@/components/loop-logo"
import { useAgentConversations } from "@/hooks/use-agent-conversations"
import { usePersistentState } from "@/hooks/use-persistent-state"
import {
  DocumentLibraryTool,
  isDocumentLibraryToolType,
} from "@/components/documents/document-library-tool"
import type { AgentConversationScope } from "@/lib/db/agent-conversations"
import type { AgentEmail, AgentEvent, FreeSlot } from "@/lib/cal-agent/tools"
import {
  agentContextMetadata,
  type AgentContextDocument,
  type AgentContextEmail,
  type AgentContextEvent,
  type AgentContextItem,
  type AgentContextMetadata,
} from "@/lib/agent-context"
import {
  isEditorToolName,
  isEditorWriteToolName,
  parseEditorToolInput,
  type EditorToolInput,
  type EditorToolResult,
  type SelectedTextContext,
} from "@/lib/document-agent/editor-tools"
import { cn } from "@/lib/utils"

const MUTATION_TYPES = new Set([
  "tool-createNewDocument",
  "tool-createNewFolder",
  "tool-moveDocumentToFolder",
  "tool-deleteUserFolder",
  "tool-replaceCurrentDocument",
  "tool-appendToCurrentDocument",
  "tool-renameCurrentDocument",
  "tool-deleteUserDocument",
  "tool-replaceSelection",
  "tool-insertBlocks",
  "tool-replaceBlocks",
  "tool-deleteBlocks",
  "tool-replaceEditorDocument",
  "tool-renameEditorDocument",
  "tool-embedCalendarEvent",
  "tool-embedEmail",
  "tool-updateEmbeddedCalendarEvent",
  "tool-updateEmbeddedEmail",
  "tool-removeSourceEmbed",
])

const LIVE_EDITOR_MUTATION_TYPES = new Set([
  "tool-replaceSelection",
  "tool-insertBlocks",
  "tool-replaceBlocks",
  "tool-deleteBlocks",
  "tool-replaceEditorDocument",
  "tool-renameEditorDocument",
  "tool-embedCalendarEvent",
  "tool-embedEmail",
  "tool-updateEmbeddedCalendarEvent",
  "tool-updateEmbeddedEmail",
  "tool-removeSourceEmbed",
])

export interface PendingDocumentAgentRequest {
  id: string
  text: string
  context?: SelectedTextContext
}

export interface DocumentAgentMutation {
  tool: string
  output: Record<string, unknown>
}

interface DocumentAgentProps {
  scope: AgentConversationScope
  documentId?: string
  pendingRequest?: PendingDocumentAgentRequest | null
  onPendingRequestHandled?: (id: string) => void
  onBeforeSend?: () => Promise<void>
  executeEditorTool?: (tool: EditorToolInput) => Promise<EditorToolResult>
  onEditorEditSettled?: () => void
  onMutated?: (mutation: DocumentAgentMutation) => void
  onClose?: () => void
}

export function DocumentAgent(props: DocumentAgentProps) {
  const store = useAgentConversations({
    scope: props.scope,
    documentId: props.documentId ?? null,
    migrateFromScope:
      props.scope === "calendar" && !props.documentId
        ? "documents"
        : undefined,
  })

  return (
    <DocumentAgentSession
      key={store.activeId}
      {...props}
      store={store}
    />
  )
}

function DocumentAgentSession(
  {
    scope,
    documentId,
    pendingRequest,
    onPendingRequestHandled,
    onBeforeSend,
    executeEditorTool,
    onEditorEditSettled,
    onMutated,
    onClose,
    store,
  }: DocumentAgentProps & { store: ReturnType<typeof useAgentConversations> }
) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [contextItems, setContextItems] = useState<AgentContextItem[]>([])
  const [selectedTextContext, setSelectedTextContext] =
    useState<SelectedTextContext | null>(null)
  const [autoApprove, setAutoApprove] = usePersistentState(
    `loop:document-agent:auto:${documentId ?? "library"}`,
    false
  )
  const timezone = useMemo(
    () =>
      typeof window !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : undefined,
    []
  )

  const {
    messages,
    sendMessage,
    status,
    stop,
    regenerate,
    error,
    addToolOutput,
    addToolApprovalResponse,
  } = useChat({
    id: store.activeId,
    messages: store.activeConversation?.messages,
    transport: useMemo(
      () =>
        new DefaultChatTransport({
          api: "/api/document-agent",
          body: { documentId, scope, autoApprove, timezone },
        }),
      [autoApprove, documentId, scope, timezone]
    ),
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic || !isEditorToolName(toolCall.toolName)) return
      if (isEditorWriteToolName(toolCall.toolName) && !autoApprove) return

      if (!executeEditorTool) {
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: { ok: false, error: "The editor is not mounted." },
        })
        return
      }

      try {
        const output = await executeEditorTool(
          parseEditorToolInput(toolCall.toolName, toolCall.input)
        )
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output,
        })
      } catch (cause) {
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText:
            cause instanceof Error ? cause.message : "Editor inspection failed",
        })
      } finally {
        if (isEditorWriteToolName(toolCall.toolName)) {
          onEditorEditSettled?.()
        }
      }
    },
    sendAutomaticallyWhen: ({ messages: currentMessages }) =>
      lastAssistantMessageIsCompleteWithApprovalResponses({
        messages: currentMessages,
      }) ||
      lastAssistantMessageIsCompleteWithToolCalls({
        messages: currentMessages,
      }),
  })

  const streaming = status === "submitted" || status === "streaming"

  const send = useCallback(
    async (
      text: string,
      context?: SelectedTextContext,
      attachedItems: AgentContextItem[] = []
    ) => {
      const sourceMetadata = agentContextMetadata(attachedItems)
      const next = text.trim() || (sourceMetadata ? "Use the attached context." : "")
      if (!next || streaming) return
      await onBeforeSend?.()
      const attachedContext = context ?? selectedTextContext ?? undefined
      if (!attachedContext) onEditorEditSettled?.()
      sendMessage({
        text: next,
        metadata:
          attachedContext || sourceMetadata
            ? {
                ...sourceMetadata,
                ...(attachedContext
                  ? { selectedTextContext: attachedContext }
                  : {}),
              }
            : undefined,
      })
      setSelectedTextContext(null)
    },
    [
      onBeforeSend,
      onEditorEditSettled,
      selectedTextContext,
      sendMessage,
      streaming,
    ]
  )

  const openEvent = useCallback(
    (event: AgentEvent) => {
      const params = new URLSearchParams({ event: event.id, date: event.start })
      router.push(`/cal?${params.toString()}`)
    },
    [router]
  )
  const openEmail = useCallback(
    (email: AgentEmail) => {
      router.push(`/mail?email=${encodeURIComponent(email.id)}`)
    },
    [router]
  )
  const openDocument = useCallback(
    (documentId: string) => {
      router.push(`/documents/${encodeURIComponent(documentId)}`)
    },
    [router]
  )
  const pickSlot = useCallback(
    (slot: FreeSlot) => {
      void send(formatSlotSelection(slot))
    },
    [send]
  )

  const processedRequestRef = useRef<string | null>(null)
  useEffect(() => {
    if (
      !pendingRequest ||
      streaming ||
      processedRequestRef.current === pendingRequest.id
    ) {
      return
    }
    let cancelled = false
    Promise.resolve().then(async () => {
      if (
        cancelled ||
        processedRequestRef.current === pendingRequest.id
      ) {
        return
      }
      processedRequestRef.current = pendingRequest.id
      onPendingRequestHandled?.(pendingRequest.id)
      if (pendingRequest.context) {
        setSelectedTextContext(pendingRequest.context)
      }
      await send(pendingRequest.text, pendingRequest.context, [])
    })
    return () => {
      cancelled = true
    }
  }, [onPendingRequestHandled, pendingRequest, send, streaming])

  const submit = (submittedValue: string) => {
    const next = submittedValue.trim()
    if (!next && contextItems.length === 0) return
    setDraft("")
    const attachedItems = contextItems
    setContextItems([])
    void send(next, undefined, attachedItems)
  }

  const approve = useCallback(
    (id: string) => addToolApprovalResponse({ id, approved: true }),
    [addToolApprovalResponse]
  )
  const reject = useCallback(
    (id: string) => {
      addToolApprovalResponse({ id, approved: false })
      onEditorEditSettled?.()
    },
    [addToolApprovalResponse, onEditorEditSettled]
  )

  const executeClientTool = useCallback(
    async (
      toolName: string,
      toolCallId: string,
      input: Record<string, unknown>
    ) => {
      if (!isEditorWriteToolName(toolName)) return
      if (!executeEditorTool) {
        addToolOutput({
          tool: toolName,
          toolCallId,
          output: { ok: false, error: "The editor is not mounted." },
        })
        return
      }
      try {
        const output = await executeEditorTool(
          parseEditorToolInput(toolName, input)
        )
        addToolOutput({ tool: toolName, toolCallId, output })
      } catch (cause) {
        addToolOutput({
          tool: toolName,
          toolCallId,
          state: "output-error",
          errorText:
            cause instanceof Error ? cause.message : "Editor update failed",
        })
      } finally {
        onEditorEditSettled?.()
      }
    },
    [addToolOutput, executeEditorTool, onEditorEditSettled]
  )

  const rejectClientTool = useCallback(
    (toolName: string, toolCallId: string) => {
      if (!isEditorWriteToolName(toolName)) return
      addToolOutput({
        tool: toolName,
        toolCallId,
        output: {
          ok: false,
          cancelled: true,
          error: "User cancelled the edit.",
        },
      })
      onEditorEditSettled?.()
    },
    [addToolOutput, onEditorEditSettled]
  )

  const nudgedApprovalRef = useRef<string | null>(null)
  useEffect(() => {
    if (status !== "ready") return
    const last = messages.at(-1)
    if (last?.role !== "assistant") return
    if (!lastAssistantMessageIsCompleteWithApprovalResponses({ messages })) return
    const responded = last.parts
      .map((part) => part as { state?: string; approval?: { id?: string; approved?: boolean } })
      .find((part) => part.state === "approval-responded" && part.approval?.approved)
    if (!responded?.approval?.id) return
    const key = `${last.id}:${responded.approval.id}`
    if (nudgedApprovalRef.current === key) return
    const timer = setTimeout(() => {
      nudgedApprovalRef.current = key
      addToolApprovalResponse({ id: responded.approval!.id!, approved: true })
    }, 700)
    return () => clearTimeout(timer)
  }, [addToolApprovalResponse, messages, status])

  const persistedApprovalRef = useRef<string | null>(null)
  useEffect(() => {
    const last = messages.at(-1)
    if (last?.role !== "assistant") return
    const signature = last.parts
      .map((part) => {
        const candidate = part as {
          state?: string
          approval?: { id?: string; approved?: boolean }
        }
        if (
          (candidate.state !== "approval-requested" &&
            candidate.state !== "approval-responded") ||
          !candidate.approval?.id
        ) {
          return null
        }
        return `${candidate.approval.id}:${candidate.state}:${String(candidate.approval.approved ?? "")}`
      })
      .filter((value): value is string => value !== null)
      .join("|")
    if (!signature) return
    const checkpoint = `${last.id}:${signature}:${status}`
    if (persistedApprovalRef.current === checkpoint) return
    persistedApprovalRef.current = checkpoint
    store.persist(messages)
  }, [messages, status, store])

  const previousStatusRef = useRef(status)
  useEffect(() => {
    if (
      previousStatusRef.current !== "ready" &&
      status === "ready" &&
      messages.length > 0
    ) {
      store.persist(messages)
    }
    previousStatusRef.current = status
  }, [messages, status, store])

  const persistedUserRef = useRef<string | null>(null)
  useEffect(() => {
    if (status !== "submitted" && status !== "streaming") return
    const last = messages.at(-1)
    if (last?.role === "user" && persistedUserRef.current !== last.id) {
      persistedUserRef.current = last.id
      store.persist(messages)
    }
  }, [messages, status, store])

  const mutationIdsRef = useRef(new Set<string>())
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts ?? []) {
        const candidate = part as {
          type?: string
          state?: string
          toolCallId?: string
          output?: Record<string, unknown>
        }
        if (
          !candidate.type ||
          !MUTATION_TYPES.has(candidate.type) ||
          candidate.state !== "output-available" ||
          !candidate.toolCallId ||
          !candidate.output?.ok ||
          mutationIdsRef.current.has(candidate.toolCallId)
        ) {
          continue
        }
        mutationIdsRef.current.add(candidate.toolCallId)
        if (LIVE_EDITOR_MUTATION_TYPES.has(candidate.type)) continue
        onMutated?.({ tool: candidate.type.replace(/^tool-/, ""), output: candidate.output })
      }
    }
  }, [messages, onMutated])

  const [suggest, setSuggest] = useState<{
    id: string
    items: string[]
  } | null>(null)
  const suggestFetchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (status !== "ready") return
    const last = messages.at(-1)
    if (!last || last.role !== "assistant") return
    const midApproval = last.parts.some((part) => {
      const state = (part as { state?: string }).state
      return state === "approval-requested" || state === "approval-responded"
    })
    if (midApproval) return
    const hasText = last.parts.some(
      (part) => part.type === "text" && part.text.trim().length > 0
    )
    if (!hasText || suggestFetchedRef.current === last.id) return
    suggestFetchedRef.current = last.id

    const controller = new AbortController()
    fetch("/api/cal-agent/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ messages, timezone }),
    })
      .then((response) =>
        response.ok ? response.json() : { suggestions: [] }
      )
      .then((data: { suggestions?: unknown }) => {
        const items = Array.isArray(data.suggestions)
          ? data.suggestions
              .filter(
                (item): item is string =>
                  typeof item === "string" && item.trim().length > 0
              )
              .slice(0, 3)
          : []
        if (items.length) setSuggest({ id: last.id, items })
      })
      .catch(() => {
        // Suggestions are best-effort.
      })
    return () => controller.abort()
  }, [messages, status, timezone])

  const empty = messages.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div className="flex min-w-0 items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assistant"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-4 sm:hidden" />
              <PanelRightCloseIcon className="hidden size-4 sm:block" />
            </button>
          )}
          <h1 className="min-w-0 truncate text-[13px] font-medium text-foreground">
            Loop assistant
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setAutoApprove((current) => !current)}
            aria-pressed={autoApprove}
            aria-label={
              autoApprove ? "Disable automatic approval" : "Enable automatic approval"
            }
            title={autoApprove ? "Turn off automatic edits" : "Automatically approve edits"}
            className={cn(
              "grid size-8 place-items-center rounded-lg text-[12px] font-medium transition-colors sm:flex sm:w-auto sm:gap-1.5 sm:px-2",
              autoApprove
                ? "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <ZapIcon className={cn("size-3.5", autoApprove && "fill-current")} />
            <span className="hidden sm:inline">Auto</span>
          </button>
        </div>
      </header>

      <AgentTabs
        openConversations={store.openConversations}
        conversations={store.conversations}
        activeId={store.activeId}
        isDraft={store.isDraft}
        onNewChat={() => {
          onEditorEditSettled?.()
          store.newChat()
        }}
        onSelect={(id) => {
          onEditorEditSettled?.()
          store.select(id)
        }}
        onCloseTab={store.closeTab}
        onDelete={store.remove}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {empty ? (
          <WriterEmptyState
            scope={documentId ? "document" : "documents"}
            onPick={(text) => void send(text)}
          />
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((message, index) => (
              <WriterMessage
                key={message.id}
                message={message}
                streaming={streaming && index === messages.length - 1}
                onApprove={approve}
                onReject={reject}
                onExecuteClientTool={executeClientTool}
                onRejectClientTool={rejectClientTool}
                onOpenEvent={openEvent}
                onOpenEmail={openEmail}
                onOpenDocument={openDocument}
                onPickSlot={pickSlot}
                onRegenerate={index === messages.length - 1 ? regenerate : undefined}
              />
            ))}
            {status === "submitted" && (
              <div className="flex items-center gap-2 text-[12px] text-ink-3">
                <span className="size-3 rounded-full border-[1.5px] border-line-strong border-t-ink-2 [animation:spin_700ms_linear_infinite]" />
                <span className="loop-shimmer">Reading and thinking…</span>
              </div>
            )}
          </div>
        )}
        {error && (
          <div role="alert" className="mt-3 rounded-control border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error.message || "Loop couldn’t finish that response"}
          </div>
        )}
      </div>

      <div className="shrink-0 p-2">
        {suggest &&
          suggest.id === messages.at(-1)?.id &&
          !streaming &&
          !error && (
            <FollowUpSuggestions
              items={suggest.items}
              onPick={(text) => void send(text)}
              className="mx-0 px-0 pt-0 pb-2"
            />
          )}
        {selectedTextContext && (
          <div className="mb-2">
            <SelectedTextContextChip
              context={selectedTextContext}
              onRemove={() => setSelectedTextContext(null)}
            />
          </div>
        )}
        <PromptBar
          value={draft}
          onValueChange={setDraft}
          onSubmit={submit}
          isStreaming={streaming}
          onStop={stop}
          showModelSelector={false}
          contextItems={contextItems}
          onContextItemsChange={setContextItems}
          footerLeading={
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-2.5 text-[11px] font-medium text-ink-3">
              <LoopMark className="h-3.5 w-3" /> Loop
            </span>
          }
        />
      </div>
    </div>
  )
}

function WriterEmptyState({
  scope,
  onPick,
}: {
  scope: "documents" | "document"
  onPick: (text: string) => void
}) {
  const prompts =
    scope === "document"
      ? [
          "Summarize this document",
          "Find emails related to this document",
          "Use my next meeting to draft the next section",
        ]
      : [
          "Create a project brief from recent email",
          "Show my recent documents",
          "Draft meeting notes from today's calendar",
        ]
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-3 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-card bg-ink text-canvas shadow-card">
        <LoopMark className="h-5 w-[17px]" />
      </span>
      <p className="mt-4 text-[14px] font-medium text-ink">Ask Loop</p>
      <p className="mt-1 max-w-56 text-[12px] leading-relaxed text-ink-3">
        {scope === "document"
          ? "Write with context from this document, your inbox, and your calendar."
          : "Create, find, and shape documents with email and calendar context."}
      </p>
      <StarterPromptList
        items={prompts}
        onPick={onPick}
        className="mt-5"
      />
    </div>
  )
}

function WriterMessage({
  message,
  streaming,
  onApprove,
  onReject,
  onExecuteClientTool,
  onRejectClientTool,
  onOpenEvent,
  onOpenEmail,
  onOpenDocument,
  onPickSlot,
  onRegenerate,
}: {
  message: UIMessage
  streaming: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onExecuteClientTool: (
    toolName: string,
    toolCallId: string,
    input: Record<string, unknown>
  ) => Promise<void>
  onRejectClientTool: (toolName: string, toolCallId: string) => void
  onOpenEvent: (event: AgentEvent) => void
  onOpenEmail: (email: AgentEmail) => void
  onOpenDocument: (documentId: string) => void
  onPickSlot: (slot: FreeSlot) => void
  onRegenerate?: () => void
}) {
  if (message.role === "user") {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part as { text: string }).text)
      .join("")
    const selectedContext = (
      message.metadata as
        | { selectedTextContext?: SelectedTextContext }
        | undefined
    )?.selectedTextContext
    const sourceContext = message.metadata as AgentContextMetadata | undefined
    return (
      <div className="flex flex-col items-end gap-1.5">
        {selectedContext && (
          <div className="w-72 max-w-[92%]">
            <SelectedTextContextChip context={selectedContext} />
          </div>
        )}
        <WriterSourceContext
          events={sourceContext?.contextEvents ?? []}
          emails={sourceContext?.contextEmails ?? []}
          documents={sourceContext?.contextDocuments ?? []}
          onOpenEvent={onOpenEvent}
          onOpenEmail={onOpenEmail}
          onOpenDocument={onOpenDocument}
        />
        <div className="max-w-[88%] rounded-card rounded-br-[4px] bg-field px-3 py-2 text-[13px] leading-relaxed text-ink shadow-hairline">
          {text}
        </div>
      </div>
    )
  }

  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("")

  return (
    <div className="group flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-control bg-ink text-canvas shadow-btn">
        <LoopMark className="h-4 w-[13px]" />
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink">
        <p className="mb-0.5 text-[13px] font-medium text-foreground">
          Loop Agent
        </p>
        {message.parts.map((part, index) =>
          part.type === "text" ? (
            <WriterText key={index} text={part.text} streaming={streaming} />
          ) : (
            <WriterToolPart
              key={index}
              part={part as unknown as WriterToolPartData}
              onApprove={onApprove}
              onReject={onReject}
              onExecuteClientTool={onExecuteClientTool}
              onRejectClientTool={onRejectClientTool}
              onOpenEvent={onOpenEvent}
              onOpenEmail={onOpenEmail}
              onPickSlot={onPickSlot}
            />
          )
        )}
        {!streaming && (text || onRegenerate) && (
          <MessageActions text={text} onRegenerate={onRegenerate} />
        )}
      </div>
    </div>
  )
}

function WriterSourceContext({
  events,
  emails,
  documents,
  onOpenEvent,
  onOpenEmail,
  onOpenDocument,
}: {
  events: AgentContextEvent[]
  emails: AgentContextEmail[]
  documents: AgentContextDocument[]
  onOpenEvent: (event: AgentEvent) => void
  onOpenEmail: (email: AgentEmail) => void
  onOpenDocument: (documentId: string) => void
}) {
  if (!events.length && !emails.length && !documents.length) return null
  return (
    <div className="flex w-72 max-w-[92%] flex-col gap-1.5">
      {events.map((event) => (
        <AgentContextCard
          key={`event:${event.id}`}
          icon={<CalendarIcon className="size-4" />}
          label={event.title || "Untitled event"}
          meta={contextDate(event.start, event.allDay ? "All day" : undefined)}
          details={event.location}
          onOpen={() => onOpenEvent(contextEventToAgentEvent(event))}
          iconClassName="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
        />
      ))}
      {emails.map((email) => (
        <AgentContextCard
          key={`email:${email.id}`}
          icon={<MailIcon className="size-4" />}
          label={email.subject || "(no subject)"}
          meta={`${email.from}${contextDate(email.date) ? ` · ${contextDate(email.date)}` : ""}`}
          details={email.snippet}
          onOpen={() => onOpenEmail(contextEmailToAgentEmail(email))}
          iconClassName="bg-sky-500/15 text-sky-700 dark:text-sky-400"
        />
      ))}
      {documents.map((document) => (
        <AgentContextCard
          key={`document:${document.id}`}
          icon={<FileTextIcon className="size-4" />}
          label={document.title || "Untitled document"}
          meta={contextDate(document.updatedAt, "Document")}
          details={document.preview}
          onOpen={() => onOpenDocument(document.id)}
          iconClassName="bg-amber-500/15 text-amber-700 dark:text-amber-400"
        />
      ))}
    </div>
  )
}

function contextEventToAgentEvent(event: AgentContextEvent): AgentEvent {
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

function contextEmailToAgentEmail(email: AgentContextEmail): AgentEmail {
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

function contextDate(value: string, fallback = ""): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date)
}

function SelectedTextContextChip({
  context,
  onRemove,
}: {
  context: SelectedTextContext
  onRemove?: () => void
}) {
  const blockLabel =
    context.startBlock === context.endBlock
      ? `Block ${context.startBlock + 1}`
      : `Blocks ${context.startBlock + 1}–${context.endBlock + 1}`
  const label =
    context.intent === "improve"
      ? "Improve selection"
      : context.intent === "shorten"
        ? "Shorten selection"
        : context.intent === "tone"
          ? "Change selection tone"
          : "Selected text"
  const preview = context.text.replace(/\s+/g, " ").trim()

  return (
    <details className="group overflow-hidden rounded-card bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-1.5 text-left [&::-webkit-details-marker]:hidden">
        <span className="grid size-8 shrink-0 place-items-center rounded-control bg-accent-tint text-accent-ink">
          <QuoteIcon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium text-ink">
            {label}
          </span>
          <span className="block truncate text-[10px] text-ink-3">
            “{preview}”
          </span>
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onRemove()
            }}
            aria-label="Remove selected text context"
            className="grid size-7 place-items-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </summary>
      <div className="border-t border-line bg-inset">
        <div className="px-3 pt-2 text-[9px] font-medium uppercase text-ink-3">
          {blockLabel} · {context.text.length} characters
        </div>
        <blockquote className="max-h-40 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-2">
          {context.text}
        </blockquote>
      </div>
    </details>
  )
}

interface WriterToolPartData {
  type?: string
  state?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  errorText?: string
  toolCallId?: string
  approval?: { id?: string; approved?: boolean }
}

function WriterToolPart({
  part,
  onApprove,
  onReject,
  onExecuteClientTool,
  onRejectClientTool,
  onOpenEvent,
  onOpenEmail,
  onPickSlot,
}: {
  part: WriterToolPartData
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onExecuteClientTool: (
    toolName: string,
    toolCallId: string,
    input: Record<string, unknown>
  ) => Promise<void>
  onRejectClientTool: (toolName: string, toolCallId: string) => void
  onOpenEvent: (event: AgentEvent) => void
  onOpenEmail: (email: AgentEmail) => void
  onPickSlot: (slot: FreeSlot) => void
}) {
  if (!part.type?.startsWith("tool-")) return null
  if (isDocumentLibraryToolType(part.type)) {
    return (
      <DocumentLibraryTool
        part={part}
        onApprove={onApprove}
        onReject={onReject}
      />
    )
  }
  if (isWorkspaceToolType(part.type)) {
    return (
      <WorkspaceTool
        part={part}
        onApprove={onApprove}
        onReject={onReject}
        onOpenEvent={onOpenEvent}
        onOpenEmail={onOpenEmail}
        onPickSlot={onPickSlot}
      />
    )
  }
  const toolName = part.type.replace(/^tool-/, "")
  const mutation = MUTATION_TYPES.has(part.type ?? "")

  if (mutation) {
    const title = mutationTitle(toolName, part.input)
    const approvalId = part.approval?.id
    const succeeded = part.state === "output-available" && part.output?.ok === true
    const rejected = part.state === "approval-responded" && part.approval?.approved === false
    const destructive =
      toolName === "deleteUserDocument" ||
      toolName === "deleteUserFolder" ||
      toolName === "deleteBlocks" ||
      toolName === "removeSourceEmbed"
    const clientMutation = LIVE_EDITOR_MUTATION_TYPES.has(part.type ?? "")
    const awaitingClientApproval =
      clientMutation && part.state === "input-available"
    const failed =
      part.state === "output-error" ||
      (part.state === "output-available" && part.output?.ok === false)
    return (
      <AgentCard
        title={title}
        icon={succeeded ? <CheckIcon className="size-3.5 text-green" /> : destructive ? <Trash2Icon className="size-3.5 text-red" /> : <WandSparklesIcon className="size-3.5" />}
        tone={destructive ? "danger" : succeeded ? "success" : "default"}
        meta={succeeded ? "Applied" : failed ? "Not applied" : rejected ? "Skipped" : part.state === "approval-requested" || awaitingClientApproval ? "Approval" : "Working"}
        footer={
          part.state === "approval-requested" && approvalId ? (
            <div className="flex gap-1.5">
              <button type="button" onClick={() => onReject(approvalId)} className="h-7 rounded-control px-2.5 text-[12px] text-ink-3 transition-colors hover:bg-hover hover:text-ink">Cancel</button>
              <button type="button" onClick={() => onApprove(approvalId)} className="h-7 rounded-control bg-ink px-3 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90">Apply change</button>
            </div>
          ) : awaitingClientApproval && part.toolCallId ? (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onRejectClientTool(toolName, part.toolCallId as string)
                }
                className="h-7 rounded-control px-2.5 text-[12px] text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void onExecuteClientTool(
                    toolName,
                    part.toolCallId as string,
                    part.input ?? {}
                  )
                }
                className="h-7 rounded-control bg-ink px-3 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90"
              >
                {applyLabel(toolName)}
              </button>
            </div>
          ) : undefined
        }
      >
        <p className="text-[12px] leading-relaxed text-ink-2">
          {mutationDescription(toolName, part.input, part.output, part.state)}
        </p>
        {!succeeded && !failed && (
          <EditorEditPreview toolName={toolName} input={part.input} />
        )}
        {part.state === "approval-responded" && part.approval?.approved && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3">
            <span className="size-3 rounded-full border-[1.5px] border-line-strong border-t-ink-2 [animation:spin_700ms_linear_infinite]" /> Applying approved edit…
          </div>
        )}
        {part.errorText && <p className="mt-2 text-[11px] text-destructive">{part.errorText}</p>}
      </AgentCard>
    )
  }

  if (toolName === "readCurrentDocument" && part.state === "output-available") {
    return (
      <div className="my-1 flex items-center gap-2 rounded-control px-1.5 py-1 text-[11.5px] text-ink-3">
        <CheckIcon className="size-3.5 text-green" />
        Read current document · {String(part.output?.wordCount ?? 0)} words
      </div>
    )
  }

  if (toolName === "inspectEditor" && part.state === "output-available") {
    const selection = part.output?.selection as
      | { text?: string; startBlock?: number; endBlock?: number }
      | null
      | undefined
    return (
      <div className="my-1 flex items-center gap-2 rounded-control px-1.5 py-1 text-[11.5px] text-ink-3">
        <CheckIcon className="size-3.5 text-green" />
        Inspected live editor · {String(part.output?.blocks instanceof Array ? part.output.blocks.length : 0)} blocks · {String(part.output?.wordCount ?? 0)} words
        {selection?.text ? " · selection included" : ""}
      </div>
    )
  }

  return (
    <div className="my-1 flex items-center gap-2 rounded-control px-1.5 py-1 text-[11.5px] text-ink-3">
      <span className={cn("grid size-4 place-items-center", part.state !== "output-available" && "loop-halo")}>
        {toolName === "readCurrentDocument" ? <FileSearchIcon className="size-3.5" /> : <FilePlus2Icon className="size-3.5" />}
      </span>
      <span className={cn(part.state !== "output-available" && "loop-shimmer")}>
        {part.state === "output-available" ? "Tool completed" : toolName === "readCurrentDocument" ? "Reading the document…" : "Working with documents…"}
      </span>
    </div>
  )
}

function formatSlotSelection(slot: FreeSlot): string {
  const start = new Date(slot.start)
  const end = new Date(slot.end)
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(start)
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return `Use this slot: ${date} from ${time.format(start)} to ${time.format(end)}.`
}

function EditorEditPreview({
  toolName,
  input,
}: {
  toolName: string
  input?: Record<string, unknown>
}) {
  if (!input) return null

  const expectedText =
    typeof input.expectedText === "string" ? input.expectedText : undefined
  const replacement =
    typeof input.replacement === "string" ? input.replacement : undefined
  const markdown =
    typeof input.markdown === "string"
      ? input.markdown
      : typeof input.content === "string"
        ? input.content
        : undefined
  const startIndex =
    typeof input.startIndex === "number" ? input.startIndex : undefined
  const endIndex =
    typeof input.endIndex === "number" ? input.endIndex : undefined
  const blockIndex =
    typeof input.blockIndex === "number" ? input.blockIndex : undefined

  let target: string | null = null
  let before: string | undefined
  let after: string | undefined
  let beforeLabel = "Current"
  let afterLabel = "Proposed"

  if (toolName === "replaceSelection") {
    target = "Current text selection"
    before = expectedText
    after = replacement
  } else if (toolName === "insertBlocks") {
    const position = String(input.position ?? "end")
    target =
      position === "end"
        ? "End of document"
        : position === "start"
          ? "Start of document"
          : `${position === "beforeBlock" ? "Before" : "After"} block ${blockIndex ?? "?"}`
    after = markdown
    afterLabel = "Insert"
  } else if (toolName === "replaceBlocks") {
    target = `Blocks ${startIndex ?? "?"}–${endIndex ?? "?"}`
    before = expectedText
    after = markdown
  } else if (toolName === "deleteBlocks") {
    target = `Blocks ${startIndex ?? "?"}–${endIndex ?? "?"}`
    before = expectedText
    beforeLabel = "Remove"
  } else if (
    toolName === "replaceEditorDocument" ||
    toolName === "replaceCurrentDocument"
  ) {
    target = "Entire document"
    after = markdown
    afterLabel = "Replacement"
  } else if (toolName === "appendToCurrentDocument") {
    target = "End of document"
    after = markdown
    afterLabel = "Append"
  } else if (toolName === "createNewDocument") {
    target = `New document · ${String(input.title ?? "Untitled")}`
    after = markdown
    afterLabel = "Initial content"
  } else if (
    toolName === "embedCalendarEvent" ||
    toolName === "embedEmail"
  ) {
    const position = String(input.position ?? "end")
    target =
      position === "end"
        ? "End of document"
        : position === "start"
          ? "Start of document"
          : `${position === "beforeBlock" ? "Before" : "After"} block ${blockIndex ?? "?"}`
    after =
      toolName === "embedCalendarEvent"
        ? `Calendar event\n${String(input.eventId ?? "Unknown source")}`
        : `Email\n${String(input.emailId ?? "Unknown source")}`
    afterLabel = toolName === "embedCalendarEvent" ? "Event card" : "Email card"
  } else if (
    toolName === "updateEmbeddedCalendarEvent" ||
    toolName === "updateEmbeddedEmail"
  ) {
    target = `${toolName === "updateEmbeddedCalendarEvent" ? "Event" : "Email"} card at block ${blockIndex ?? "?"}`
    after =
      toolName === "updateEmbeddedCalendarEvent"
        ? `Calendar event\n${String(input.eventId ?? "Unknown source")}`
        : `Email\n${String(input.emailId ?? "Unknown source")}`
    afterLabel = "Updated card"
  } else if (toolName === "removeSourceEmbed") {
    target = `${input.sourceType === "event" ? "Event" : "Email"} card at block ${blockIndex ?? "?"}`
    before = String(
      input.sourceLabel ?? input.expectedSourceId ?? "Embedded source"
    )
    beforeLabel = "Remove from document"
  } else if (toolName === "renameEditorDocument") {
    target = "Document title"
    after = String(input.title ?? "Untitled")
    afterLabel = "New title"
  }

  if (!target && !before && !after) return null

  return (
    <div className="mt-3 overflow-hidden rounded-card bg-inset shadow-hairline">
      {target && (
        <div className="border-b border-line px-2.5 py-1.5 text-[10px] font-medium text-ink-3">
          Target · {target}
        </div>
      )}
      {before && (
        <EditTextBlock label={beforeLabel} text={before} tone="remove" />
      )}
      {after && <EditTextBlock label={afterLabel} text={after} tone="add" />}
      {!before && !after && (
        <div className="px-2.5 py-2 text-[11px] text-ink-3">
          No text preview was supplied for this operation.
        </div>
      )}
    </div>
  )
}

function EditTextBlock({
  label,
  text,
  tone,
}: {
  label: string
  text: string
  tone: "add" | "remove"
}) {
  return (
    <div className="border-b border-line last:border-b-0">
      <div
        className={cn(
          "flex items-center justify-between px-2.5 py-1 text-[9px] font-medium uppercase",
          tone === "add" ? "text-green" : "text-red"
        )}
      >
        <span>{label}</span>
        <span className="font-mono tabular-nums opacity-70">
          {text.length} chars
        </span>
      </div>
      <pre
        className={cn(
          "max-h-44 overflow-auto whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink-2",
          tone === "add" ? "bg-green-tint/35" : "bg-red-tint/35"
        )}
      >
        {text}
      </pre>
    </div>
  )
}

function applyLabel(toolName: string): string {
  if (toolName === "replaceSelection") return "Replace selection"
  if (toolName === "insertBlocks") return "Insert blocks"
  if (toolName === "replaceBlocks") return "Replace blocks"
  if (toolName === "deleteBlocks") return "Delete blocks"
  if (toolName === "replaceEditorDocument") return "Replace document"
  if (toolName === "renameEditorDocument") return "Rename document"
  if (toolName === "embedCalendarEvent") return "Embed event"
  if (toolName === "embedEmail") return "Embed email"
  if (toolName === "updateEmbeddedCalendarEvent") return "Update event card"
  if (toolName === "updateEmbeddedEmail") return "Update email card"
  if (toolName === "removeSourceEmbed") return "Remove card"
  return "Apply change"
}

function mutationTitle(toolName: string, input?: Record<string, unknown>): string {
  if (toolName === "createNewDocument") return `Create “${String(input?.title ?? "Untitled")}”`
  if (toolName === "createNewFolder") return `Create folder “${String(input?.name ?? "Untitled")}”`
  if (toolName === "moveDocumentToFolder") {
    const folder = input?.folderName ? `“${String(input.folderName)}”` : "the library root"
    return `Move “${String(input?.title ?? "document")}” to ${folder}`
  }
  if (toolName === "deleteUserFolder") return `Delete folder “${String(input?.name ?? "folder")}”`
  if (toolName === "renameCurrentDocument") return `Rename to “${String(input?.title ?? "Untitled")}”`
  if (toolName === "deleteUserDocument") return `Delete “${String(input?.title ?? "document")}”`
  if (toolName === "replaceSelection") return "Rewrite selection"
  if (toolName === "insertBlocks") return "Insert document blocks"
  if (toolName === "replaceBlocks") return `Replace blocks ${String(input?.startIndex ?? "?")}–${String(input?.endIndex ?? "?")}`
  if (toolName === "deleteBlocks") return `Delete blocks ${String(input?.startIndex ?? "?")}–${String(input?.endIndex ?? "?")}`
  if (toolName === "replaceEditorDocument") return "Rewrite document"
  if (toolName === "renameEditorDocument") return `Rename to “${String(input?.title ?? "Untitled")}”`
  if (toolName === "embedCalendarEvent") return "Embed calendar event"
  if (toolName === "embedEmail") return "Embed email"
  if (toolName === "updateEmbeddedCalendarEvent") return "Update event card"
  if (toolName === "updateEmbeddedEmail") return "Update email card"
  if (toolName === "removeSourceEmbed") return `Remove “${String(input?.sourceLabel ?? "embedded source")}” from document`
  if (toolName === "appendToCurrentDocument") return "Append to document"
  return "Revise document"
}

function mutationDescription(
  toolName: string,
  input: Record<string, unknown> | undefined,
  output: Record<string, unknown> | undefined,
  state: string | undefined
): string {
  if (state === "output-available" && output?.ok) {
    if (toolName === "deleteUserDocument") return "The document was deleted."
    if (toolName === "deleteUserFolder") return "The folder was deleted and its documents returned to the library root."
    if (toolName === "createNewDocument") return "The new document is ready in your library."
    if (toolName === "createNewFolder") return "The new folder is ready in your library."
    if (toolName === "moveDocumentToFolder") return "The document was moved."
    if (toolName === "embedCalendarEvent") return "The event is embedded in the document."
    if (toolName === "embedEmail") return "The email is embedded in the document."
    if (toolName === "updateEmbeddedCalendarEvent") return "The event card was updated."
    if (toolName === "updateEmbeddedEmail") return "The email card was updated."
    if (toolName === "removeSourceEmbed") return "The card was removed from the document. The source was not deleted."
    return String(output.changeSummary ?? "The document was updated.")
  }
  if (toolName === "deleteUserDocument") return "This permanently removes the document and its revision history."
  if (toolName === "deleteUserFolder") return "Documents inside it will move back to the library root."
  if (toolName === "removeSourceEmbed") return String(input?.changeSummary ?? "This removes only the card from the document, not its source.")
  return String(input?.changeSummary ?? "Loop is ready to apply this change.")
}

function WriterText({ text, streaming }: { text: string; streaming: boolean }) {
  const smoothed = useSmoothText(text, streaming)
  if (!smoothed) return null
  return (
    <Streamdown className="loop-markdown break-words" animated={false}>
      {smoothed}
    </Streamdown>
  )
}

function MessageActions({ text, onRegenerate }: { text: string; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1_500)
    } catch {
      // Clipboard access is best-effort.
    }
  }
  return (
    <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {text && (
        <button type="button" onClick={() => void copy()} aria-label="Copy response" className="grid size-7 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink">
          {copied ? <CheckIcon className="size-3.5 text-green" /> : <CopyIcon className="size-3.5" />}
        </button>
      )}
      {onRegenerate && (
        <button type="button" onClick={onRegenerate} aria-label="Regenerate response" className="grid size-7 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink">
          <RefreshCwIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}