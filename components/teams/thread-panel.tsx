"use client"

import {
  CheckIcon,
  CircleDashedIcon,
  CornerDownLeftIcon,
  EyeOffIcon,
  PenLineIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  Share2Icon,
} from "lucide-react"
import { useMemo, useState } from "react"

import {
  askAssistant,
  type AssistantAction,
  type AssistantReply,
  type ThreadContext,
} from "@/components/teams/ask-assistant"
import {
  MEMBERS,
  MEMBER_LIST,
  STATUS_LABEL,
  type Member,
  type MemberId,
  type SharedThread,
  type ThreadStatus,
} from "@/components/teams/mock-data"
import { RelativeTime } from "@/components/teams/relative-time"
import type { CommentAuthor, LiveComment } from "@/components/teams/use-thread-room"
import { cn } from "@/lib/utils"

const SUGGESTIONS = ["Draft a reply", "Who should own this?", "Catch me up"]

/** A model that only calls a tool streams no prose, so stand in for it. */
function describeReply(reply: AssistantReply): string {
  if (reply.draft?.length) return "Drafted a reply below."
  const action = reply.actions[0]
  if (action?.kind === "assign")
    return `Suggested handing this to ${action.member}.`
  if (action?.kind === "status") return "Suggested moving this thread on."
  return "Done."
}

/**
 * A private, client-only exchange with the assistant. Kept out of the Yjs
 * document so asking a question doesn't put it in front of the whole team;
 * the answer can be promoted to the shared thread afterwards.
 */
interface PrivateEntry {
  id: string
  at: string
  role: "user" | "assistant"
  body: string
  draft?: string[]
  actions?: AssistantAction[]
  /** The question that produced an assistant answer, kept for sharing it. */
  question?: string
  shared?: boolean
}

interface Row {
  id: string
  at: string
  isPrivate: boolean
  author: CommentAuthor
  body: string
  askedBy?: MemberId
  draft?: string[]
  actions?: AssistantAction[]
  question?: string
  shared?: boolean
}

/**
 * The team's internal thread. Teammate notes and assistant answers share one
 * timeline. Notes and shared answers live in the thread's Yjs document; private
 * answers stay on this client until someone chooses to share them.
 */
export function ThreadPanel({
  buildContext,
  comments,
  me,
  onAssign,
  onAssistantReply,
  onComment,
  onInsertDraft,
  onSetStatus,
  presence,
  thread,
}: {
  buildContext: () => ThreadContext
  comments: LiveComment[]
  me: Member
  onAssign: (id: MemberId | null) => void
  onAssistantReply: (reply: {
    body: string
    draft?: string[]
    question?: string
  }) => void
  onComment: (body: string) => void
  onInsertDraft: (paragraphs: string[]) => void
  onSetStatus: (status: ThreadStatus) => void
  presence: { id: string }[]
  thread: SharedThread
}) {
  const [input, setInput] = useState("")
  const [privateEntries, setPrivateEntries] = useState<PrivateEntry[]>([])
  const [pending, setPending] = useState(false)
  const [streamed, setStreamed] = useState("")
  const [error, setError] = useState<string | null>(null)

  const rows: Row[] = useMemo(() => {
    const fromTeam: Row[] = comments.map((comment) => ({
      id: comment.id,
      at: comment.at,
      isPrivate: false,
      author: comment.author,
      body: comment.body,
      askedBy: comment.askedBy,
      draft: comment.draft,
    }))
    const fromMe: Row[] = privateEntries.map((entry) => ({
      id: entry.id,
      at: entry.at,
      isPrivate: true,
      author: entry.role === "assistant" ? "assistant" : me.id,
      body: entry.body,
      draft: entry.draft,
      actions: entry.actions,
      question: entry.question,
      shared: entry.shared,
    }))
    return [...fromTeam, ...fromMe].sort((a, b) => a.at.localeCompare(b.at))
  }, [comments, privateEntries, me.id])

  const postNote = () => {
    if (!input.trim()) return
    onComment(input)
    setInput("")
  }

  const ask = (prompt: string) => {
    const question = prompt.trim()
    if (!question || pending) return

    setInput("")
    setError(null)
    setPending(true)
    setStreamed("")
    setPrivateEntries((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        role: "user",
        body: question,
      },
    ])

    askAssistant(question, buildContext(), setStreamed)
      .then((reply) => {
        setPrivateEntries((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            role: "assistant",
            body: reply.text || describeReply(reply),
            draft: reply.draft,
            actions: reply.actions,
            question,
          },
        ])
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "The assistant failed.")
      })
      .finally(() => {
        setPending(false)
        setStreamed("")
      })
  }

  const share = (row: Row) => {
    onAssistantReply({
      body: row.body,
      draft: row.draft,
      question: row.question,
    })
    setPrivateEntries((current) =>
      current.map((entry) =>
        entry.id === row.id ? { ...entry, shared: true } : entry
      )
    )
  }

  // Applied through the Yjs room, so accepting a suggestion moves the thread
  // for every teammate watching it, not just here.
  const applyAction = (action: AssistantAction) => {
    if (action.kind === "status") {
      onSetStatus(action.status)
      return
    }
    const match = MEMBER_LIST.find(
      (member) =>
        member.name.toLowerCase() === action.member.toLowerCase() ||
        member.name.split(" ")[0].toLowerCase() === action.member.toLowerCase()
    )
    if (match) onAssign(match.id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-3">
        {rows.map((row) => (
          <EntryRow
            key={row.id}
            onApplyAction={applyAction}
            onInsertDraft={onInsertDraft}
            onShare={() => share(row)}
            presence={presence}
            row={row}
          />
        ))}

        {pending && (
          <div className="flex gap-2.5">
            <AssistantAvatar />
            <div className="min-w-0 flex-1">
              <span className="text-[12px] font-semibold">Assistant</span>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                {streamed || "Thinking…"}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 p-2.5">
        {!input.trim() && !pending && (
          <div className="mb-2 flex flex-wrap gap-1">
            {SUGGESTIONS.map((suggestion) => (
              <button
                className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                key={suggestion}
                onClick={() => ask(suggestion)}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border/70 bg-background transition-colors focus-within:border-ring/60">
          <textarea
            className="w-full resize-none bg-transparent px-3 pt-2 pb-1 text-[12px] outline-none placeholder:text-muted-foreground/70"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                postNote()
              }
            }}
            placeholder="Ask the assistant, or post a note for the team…"
            rows={2}
            value={input}
          />
          <div className="flex items-center gap-1 px-2 pb-1.5">
            <span className="flex-1 truncate text-[10px] text-muted-foreground/70">
              as {me.name.split(" ")[0]}
            </span>
            <button
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              disabled={!input.trim() || pending}
              onClick={() => ask(input)}
              title="Only you see this — you can share the answer afterwards"
              type="button"
            >
              <SparklesIcon className="size-3" />
              Ask AI
            </button>
            <button
              className="flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              disabled={!input.trim()}
              onClick={postNote}
              title="Post a note the whole team sees"
              type="button"
            >
              <CornerDownLeftIcon className="size-3" />
              Post
            </button>
          </div>
        </div>
        <p className="px-1 pt-1.5 text-[10px] leading-relaxed text-muted-foreground/60">
          Ask AI is private to you. Post shares with the team — never with{" "}
          {thread.counterparty.name.split(" ")[0]}.
        </p>
      </div>
    </div>
  )
}

function EntryRow({
  onApplyAction,
  onInsertDraft,
  onShare,
  presence,
  row,
}: {
  onApplyAction: (action: AssistantAction) => void
  onInsertDraft: (paragraphs: string[]) => void
  onShare: () => void
  presence: { id: string }[]
  row: Row
}) {
  const isAssistant = row.author === "assistant"
  const author = isAssistant ? null : MEMBERS[row.author as MemberId]
  const asker = row.askedBy ? MEMBERS[row.askedBy] : null
  const online = author ? presence.some((p) => p.id === author.id) : false

  return (
    <div className={cn("flex gap-2.5", row.isPrivate && "opacity-90")}>
      <div className="relative shrink-0">
        {isAssistant ? (
          <AssistantAvatar />
        ) : (
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full text-[10px] font-semibold",
              author?.tint
            )}
          >
            {author?.initials}
          </span>
        )}
        {online && (
          <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-background bg-emerald-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-[12px] font-semibold">
            {isAssistant ? "Assistant" : author?.name.split(" ")[0]}
          </span>
          {asker && (
            <span className="text-[10px] text-muted-foreground">
              for {asker.name.split(" ")[0]}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            <RelativeTime value={row.at} />
          </span>
          {row.isPrivate && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              <EyeOffIcon className="size-2.5" />
              Only you
            </span>
          )}
        </div>

        {row.body && (
          <p
            className={cn(
              "mt-0.5 text-[12px] leading-relaxed whitespace-pre-wrap",
              row.isPrivate ? "text-foreground/75" : "text-foreground/90"
            )}
          >
            {row.body}
          </p>
        )}

        {row.draft && <DraftCard onInsert={onInsertDraft} paragraphs={row.draft} />}

        {row.actions?.map((action, i) => (
          <ActionCard action={action} key={i} onApply={() => onApplyAction(action)} />
        ))}

        {row.isPrivate && isAssistant && (
          <button
            className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            disabled={row.shared}
            onClick={onShare}
            type="button"
          >
            {row.shared ? (
              <>
                <CheckIcon className="size-2.5" />
                Shared with the team
              </>
            ) : (
              <>
                <Share2Icon className="size-2.5" />
                Share with the team
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function DraftCard({
  onInsert,
  paragraphs,
}: {
  onInsert: (paragraphs: string[]) => void
  paragraphs: string[]
}) {
  const [inserted, setInserted] = useState(false)

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border/70">
      <div className="space-y-1.5 bg-muted/30 px-2.5 py-2">
        {paragraphs.map((paragraph, i) => (
          <p className="text-[11px] leading-relaxed text-foreground/80" key={i}>
            {paragraph}
          </p>
        ))}
      </div>
      <button
        className={cn(
          "flex w-full items-center justify-center gap-1.5 border-t border-border/60 py-1.5 text-[11px] font-medium transition-colors",
          inserted
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-foreground hover:bg-muted"
        )}
        disabled={inserted}
        onClick={() => {
          onInsert(paragraphs)
          setInserted(true)
        }}
        type="button"
      >
        {inserted ? (
          <>
            <CheckIcon className="size-3" />
            Added to the shared draft
          </>
        ) : (
          <>
            <PenLineIcon className="size-3" />
            Add to shared draft
          </>
        )}
      </button>
    </div>
  )
}

function ActionCard({
  action,
  onApply,
}: {
  action: AssistantAction
  onApply: () => void
}) {
  const [applied, setApplied] = useState(false)

  const member =
    action.kind === "assign"
      ? MEMBER_LIST.find(
          (m) =>
            m.name.toLowerCase() === action.member.toLowerCase() ||
            m.name.split(" ")[0].toLowerCase() === action.member.toLowerCase()
        )
      : undefined

  const label =
    action.kind === "assign"
      ? `Assign to ${member?.name.split(" ")[0] ?? action.member}`
      : `Mark ${STATUS_LABEL[action.status]}`

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2">
      {action.kind === "assign" ? (
        member ? (
          <span
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold",
              member.tint
            )}
          >
            {member.initials}
          </span>
        ) : (
          <UserPlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )
      ) : (
        <CircleDashedIcon className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium">{label}</p>
        <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
          {action.reason}
        </p>
      </div>
      <button
        className={cn(
          "shrink-0 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
          applied
            ? "text-emerald-600 dark:text-emerald-400"
            : "bg-foreground text-background hover:opacity-90"
        )}
        disabled={applied}
        onClick={() => {
          onApply()
          setApplied(true)
        }}
        type="button"
      >
        {applied ? "Done" : "Apply"}
      </button>
    </div>
  )
}

function AssistantAvatar() {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background">
      <SparklesIcon className="size-3" />
    </span>
  )
}
