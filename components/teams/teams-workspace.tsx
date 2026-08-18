"use client"

import {
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PanelRightCloseIcon,
  SparklesIcon,
  UserPlusIcon,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useMemo, useRef, useState } from "react"

import { askAssistant, type ThreadContext } from "@/components/teams/ask-assistant"
import { ComposeCard } from "@/components/teams/compose"
import type { DraftHandle } from "@/components/teams/draft-editor"
import { MessageThread } from "@/components/teams/email-message"
import {
  MEMBERS,
  MEMBER_LIST,
  STATUS_LABEL,
  STATUS_STYLE,
  THREADS,
  messageText,
  threadParticipants,
  type MemberId,
  type SharedThread,
  type ThreadStatus,
} from "@/components/teams/mock-data"
import { TeamsSidebar, type ThreadFilter } from "@/components/teams/teams-sidebar"
import { RelativeTime } from "@/components/teams/relative-time"
import { ThreadPanel } from "@/components/teams/thread-panel"
import {
  useThreadRoom,
  type LiveComment,
} from "@/components/teams/use-thread-room"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { useSidebarResize } from "@/hooks/use-sidebar-resize"
import { cn } from "@/lib/utils"

export function TeamsWorkspace() {
  const router = useRouter()
  const params = useSearchParams()
  const [filter, setFilter] = useState<ThreadFilter>("all")

  const meId = (params.get("as") as MemberId) || "priya"
  const me = MEMBERS[meId] ?? MEMBERS.priya
  const activeId = params.get("thread") ?? THREADS[0].id
  const thread = THREADS.find((t) => t.id === activeId) ?? THREADS[0]

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString())
      next.set(key, value)
      router.replace(`/teams?${next}`, { scroll: false })
    },
    [params, router]
  )

  const threads = useMemo(() => {
    if (filter === "mine") return THREADS.filter((t) => t.assignee === me.id)
    if (filter === "unassigned") return THREADS.filter((t) => !t.assignee)
    return THREADS
  }, [filter, me.id])

  const counts = useMemo(
    () => ({
      all: THREADS.length,
      mine: THREADS.filter((t) => t.assignee === me.id).length,
      unassigned: THREADS.filter((t) => !t.assignee).length,
    }),
    [me.id]
  )

  // Owned here rather than in ThreadDetail so the sidebar can show who's around.
  const room = useThreadRoom(thread.id, {
    id: me.id,
    name: me.name,
    color: me.color,
  })

  return (
    <div className="flex h-svh w-full overflow-hidden bg-muted/40">
      <TeamsSidebar
        counts={counts}
        filter={filter}
        me={me}
        online={room.presence.map((p) => p.id)}
        onFilterChange={setFilter}
        onSwitchIdentity={(id) => setParam("as", id)}
      />

      <ThreadList
        activeId={thread.id}
        meId={me.id}
        onSelect={(id) => setParam("thread", id)}
        threads={threads}
      />

      <ThreadDetail key={thread.id} me={me} room={room} thread={thread} />
    </div>
  )
}

function ThreadList({
  activeId,
  meId,
  onSelect,
  threads,
}: {
  activeId: string
  meId: MemberId
  onSelect: (id: string) => void
  threads: SharedThread[]
}) {
  return (
    <aside className="hidden w-[300px] shrink-0 py-2 lg:block">
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
          <h2 className="flex-1 font-heading text-[13px] font-semibold">
            Shared threads
          </h2>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {threads.length}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {threads.length === 0 ? (
            <p className="px-2 py-8 text-center text-[12px] text-muted-foreground">
              Nothing here yet.
            </p>
          ) : (
            threads.map((item) => (
              <ThreadRow
                active={item.id === activeId}
                key={item.id}
                meId={meId}
                onSelect={() => onSelect(item.id)}
                thread={item}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  )
}

function ThreadRow({
  active,
  meId,
  onSelect,
  thread,
}: {
  active: boolean
  meId: MemberId
  onSelect: () => void
  thread: SharedThread
}) {
  const unread = !thread.readBy.includes(meId)
  const assignee = thread.assignee ? MEMBERS[thread.assignee] : null
  const sharer = MEMBERS[thread.sharedBy]
  const latest = thread.messages[thread.messages.length - 1]
  const hasAttachments = thread.messages.some((m) => m.attachments?.length)

  return (
    <button
      className={cn(
        "mb-0.5 flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-colors",
        active ? "bg-muted" : "hover:bg-muted/60"
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center gap-1.5">
        {unread && <span className="size-1.5 shrink-0 rounded-full bg-brand" />}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            unread ? "font-semibold" : "font-medium"
          )}
        >
          {thread.counterparty.name}
        </span>
        {thread.messages.length > 1 && (
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {thread.messages.length}
          </span>
        )}
        <span className="shrink-0 text-[10px] text-muted-foreground">
          <RelativeTime addSuffix={false} value={thread.sharedAt} />
        </span>
      </div>

      <span
        className={cn(
          "truncate text-[12px] leading-snug",
          unread ? "font-medium text-foreground" : "text-foreground/80"
        )}
      >
        {thread.subject}
      </span>

      {latest && (
        <span className="truncate text-[11px] leading-snug text-muted-foreground">
          {messageText(latest)}
        </span>
      )}

      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[9px] font-medium",
            STATUS_STYLE[thread.status]
          )}
        >
          {STATUS_LABEL[thread.status]}
        </span>
        {thread.comments.length > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <MessageSquareIcon className="size-3" />
            {thread.comments.length}
          </span>
        )}
        {hasAttachments && (
          <PaperclipIcon className="size-3 text-muted-foreground" />
        )}
        <div className="flex-1" />
        {assignee ? (
          <span title={`Assigned to ${assignee.name}`}>
            <Avatar member={assignee} size="xs" />
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            shared by {sharer.name.split(" ")[0]}
          </span>
        )}
      </div>
    </button>
  )
}

function ThreadDetail({
  me,
  room,
  thread,
}: {
  me: (typeof MEMBERS)[MemberId]
  room: ReturnType<typeof useThreadRoom>
  thread: SharedThread
}) {
  // Yjs is the source of truth once someone changes something; before that the
  // fixture value stands in.
  const assignee = room.assignee === undefined ? thread.assignee : room.assignee
  const status = room.status ?? thread.status

  const comments: LiveComment[] = useMemo(
    () => [...thread.comments, ...room.comments],
    [thread.comments, room.comments]
  )

  const [draftHandle, setDraftHandle] = useState<DraftHandle | null>(null)
  const [aiWriting, setAiWriting] = useState(false)
  const composeRef = useRef<HTMLDivElement>(null)

  const scrollToCompose = useCallback(() => {
    composeRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [])

  const online = useMemo(
    () => room.presence.map((p) => p.id),
    [room.presence]
  )

  const participants = useMemo(() => threadParticipants(thread), [thread])

  const attachmentCount = useMemo(
    () =>
      thread.messages.reduce(
        (total, message) => total + (message.attachments?.length ?? 0),
        0
      ),
    [thread.messages]
  )

  const context: ThreadContext = useMemo(
    () => ({
      subject: thread.subject,
      counterparty: `${thread.counterparty.name} (${thread.counterparty.company})`,
      status,
      assignee: assignee ? MEMBERS[assignee].name : null,
      messages: thread.messages.map((m) => ({
        from: m.from.name,
        sentAt: m.sentAt,
        body: messageText(m),
      })),
      comments: comments.map((c) => ({
        author: c.author === "assistant" ? "Assistant" : MEMBERS[c.author].name,
        body: c.body,
      })),
      draft: "",
      me: me.name,
      team: MEMBER_LIST.map((member) => ({
        name: member.name,
        role: member.role,
        online: online.includes(member.id),
      })),
      otherThreads: THREADS.filter((t) => t.id !== thread.id).map((t) => ({
        subject: t.subject,
        counterparty: `${t.counterparty.name} (${t.counterparty.company})`,
        status: t.status,
        assignee: t.assignee ? MEMBERS[t.assignee].name : null,
        waitingOn: t.messages.at(-1)?.from.external ? "us" : "them",
      })),
    }),
    [thread, status, assignee, comments, me.name, online]
  )

  // Resolved when the request is made so the assistant sees the live draft,
  // not the fixture it started from.
  const buildContext = useCallback(
    (): ThreadContext => ({
      ...context,
      draft: draftHandle?.getText() ?? "",
    }),
    [context, draftHandle]
  )

  const insertDraft = useCallback(
    (paragraphs: string[]) => draftHandle?.insertParagraphs(paragraphs),
    [draftHandle]
  )

  // Writes straight into the shared draft and leaves a note in the thread, so
  // the team sees who asked for it rather than text appearing from nowhere.
  // Replaces rather than appends: running this twice should refine one reply,
  // not stack two complete letters on top of each other.
  const writeWithAi = useCallback(() => {
    if (aiWriting) return
    setAiWriting(true)
    askAssistant(
      "Write the reply for this thread. If the shared draft already has content, treat it as a starting point and produce one improved, complete reply.",
      buildContext()
    )
      .then((reply) => {
        if (reply.draft?.length) {
          draftHandle?.replaceParagraphs(reply.draft)
          room.addAssistantReply({ body: "Rewrote the shared draft." })
        } else {
          room.addAssistantReply({ body: reply.text })
        }
      })
      .catch(() => {
        room.addAssistantReply({ body: "I couldn't write a draft just now." })
      })
      .finally(() => setAiWriting(false))
  }, [aiWriting, buildContext, draftHandle, room])

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col p-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
          <header className="shrink-0 border-b border-border/60 px-5 py-3.5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="font-heading text-[15px] leading-tight font-semibold">
                  {thread.subject}
                </h1>
                <p className="mt-1 truncate text-[12px] text-muted-foreground">
                  {participants.map((p) => p.name).join(", ")}
                  <span className="text-muted-foreground/60">
                    {" "}· {thread.messages.length} message
                    {thread.messages.length === 1 ? "" : "s"} · shared by{" "}
                    {MEMBERS[thread.sharedBy].name.split(" ")[0]}
                  </span>
                </p>
              </div>
              <PresenceStack presence={room.presence} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <StatusPicker onChange={room.setStatus} value={status} />
              <AssigneePicker onChange={room.setAssignee} value={assignee} />
              {attachmentCount > 0 && (
                <span className="flex items-center gap-1 rounded-md border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                  <PaperclipIcon className="size-3" />
                  {attachmentCount}
                </span>
              )}
              {thread.labels.length > 0 && (
                <span className="mx-1 h-3.5 w-px bg-border" />
              )}
              {thread.labels.map((label) => (
                <span className="text-[11px] text-muted-foreground" key={label}>
                  #{label}
                </span>
              ))}
            </div>
          </header>

          <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              <MessageThread
                me={me}
                messages={thread.messages}
                onReply={scrollToCompose}
                subject={thread.subject}
              />
              <div ref={composeRef}>
                <ComposeCard
                  aiWriting={aiWriting}
                  me={me}
                  onDraftReady={setDraftHandle}
                  onTypingChange={room.setTyping}
                  onWriteWithAi={writeWithAi}
                  thread={thread}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <RightRail
        buildContext={buildContext}
        comments={comments}
        me={me}
        onAssign={room.setAssignee}
        onAssistantReply={room.addAssistantReply}
        onComment={room.addComment}
        onInsertDraft={insertDraft}
        onSetStatus={room.setStatus}
        presence={room.presence}
        thread={thread}
      />
    </>
  )
}

function RightRail({
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
  me: (typeof MEMBERS)[MemberId]
  onAssign: (id: MemberId | null) => void
  onAssistantReply: (reply: {
    body: string
    draft?: string[]
    question?: string
  }) => void
  onComment: (body: string) => void
  onInsertDraft: (paragraphs: string[]) => void
  onSetStatus: (status: ThreadStatus) => void
  presence: { id: MemberId }[]
  thread: SharedThread
}) {
  const [width, setWidth] = useState("24rem")
  const [collapsed, setCollapsed] = usePersistentState(
    "loop:teams:rail-collapsed",
    false
  )
  const [isDragging, setIsDragging] = useState(false)

  const toggle = useCallback(() => setCollapsed((c) => !c), [setCollapsed])

  const { dragRef, handleMouseDown } = useSidebarResize({
    direction: "left",
    currentWidth: width,
    onResize: setWidth,
    onToggle: toggle,
    isCollapsed: collapsed,
    minResizeWidth: "20rem",
    maxResizeWidth: "34rem",
    setIsDraggingRail: setIsDragging,
    widthCookieName: "loop_teams_rail_width",
  })

  if (collapsed) {
    return (
      <div className="hidden h-svh shrink-0 py-2 pr-2 md:block">
        <button
          className="flex h-full w-11 flex-col items-center justify-between rounded-2xl border border-border/70 bg-background py-3 shadow-sm transition-colors hover:bg-muted"
          onClick={() => setCollapsed(false)}
          title="Open team thread"
          type="button"
        >
          <MessageSquareIcon className="size-4 text-foreground" />
          <span
            className="text-[12px] font-medium tracking-wide text-muted-foreground"
            style={{ writingMode: "vertical-rl" }}
          >
            Team thread
          </span>
          {comments.length > 0 ? (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {comments.length}
            </span>
          ) : (
            <MessageSquareIcon aria-hidden className="size-4 text-transparent" />
          )}
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative hidden h-svh shrink-0 py-2 pr-2 md:block",
        !isDragging && "transition-[width] duration-200 ease-linear"
      )}
      style={{ width }}
    >
      <button
        aria-label="Resize panel"
        className="absolute inset-y-0 left-0 z-20 flex w-4 -translate-x-1/2 cursor-w-resize after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:transition-colors hover:after:bg-border"
        onMouseDown={handleMouseDown}
        ref={dragRef}
        tabIndex={-1}
        title="Resize panel"
        type="button"
      />

      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <h2 className="flex-1 font-heading text-[13px] font-semibold">
            Team thread
          </h2>
          <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <SparklesIcon className="size-2.5" />
            AI in here
          </span>
          <button
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setCollapsed(true)}
            title="Collapse panel"
            type="button"
          >
            <PanelRightCloseIcon className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1">
          <ThreadPanel
            buildContext={buildContext}
            comments={comments}
            me={me}
            onAssign={onAssign}
            onAssistantReply={onAssistantReply}
            onComment={onComment}
            onInsertDraft={onInsertDraft}
            onSetStatus={onSetStatus}
            presence={presence}
            thread={thread}
          />
        </div>
      </div>
    </div>
  )
}

function PresenceStack({
  presence,
}: {
  presence: { id: MemberId; typing: boolean }[]
}) {
  if (presence.length === 0) return null

  return (
    <div className="flex shrink-0 items-center -space-x-1.5">
      {presence.map((person) => {
        const member = MEMBERS[person.id]
        if (!member) return null
        return (
          <span
            className="relative rounded-full ring-2 ring-background"
            key={person.id}
            title={person.typing ? `${member.name} is typing` : member.name}
          >
            <Avatar member={member} size="sm" />
            {person.typing && (
              <span className="absolute -right-0.5 -bottom-0.5 size-2 animate-pulse rounded-full border-2 border-background bg-emerald-500" />
            )}
          </span>
        )
      })}
    </div>
  )
}

function StatusPicker({
  onChange,
  value,
}: {
  onChange: (status: ThreadStatus) => void
  value: ThreadStatus
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80",
            STATUS_STYLE[value]
          )}
          type="button"
        >
          <CircleDashedIcon className="size-3" />
          {STATUS_LABEL[value]}
          <ChevronDownIcon className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1">
        {(Object.keys(STATUS_LABEL) as ThreadStatus[]).map((status) => (
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-muted"
            key={status}
            onClick={() => onChange(status)}
            type="button"
          >
            <span className={cn("size-2 rounded-full", STATUS_STYLE[status])} />
            <span className="flex-1 text-left">{STATUS_LABEL[status]}</span>
            {status === value && <CheckIcon className="size-3.5" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function AssigneePicker({
  onChange,
  value,
}: {
  onChange: (id: MemberId | null) => void
  value: MemberId | null
}) {
  const assignee = value ? MEMBERS[value] : null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
          type="button"
        >
          {assignee ? (
            <>
              <Avatar member={assignee} size="xs" />
              {assignee.name.split(" ")[0]}
            </>
          ) : (
            <>
              <UserPlusIcon className="size-3" />
              Assign
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        {MEMBER_LIST.map((member) => (
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-muted"
            key={member.id}
            onClick={() => onChange(member.id)}
            type="button"
          >
            <Avatar member={member} size="xs" />
            <span className="flex-1 text-left">{member.name}</span>
            {member.id === value && <CheckIcon className="size-3.5" />}
          </button>
        ))}
        <button
          className="mt-0.5 flex w-full items-center gap-2 rounded-md border-t border-border/60 px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted"
          onClick={() => onChange(null)}
          type="button"
        >
          Unassign
        </button>
      </PopoverContent>
    </Popover>
  )
}

function Avatar({
  member,
  size = "sm",
}: {
  member: { initials: string; tint: string }
  size?: "xs" | "sm"
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        member.tint,
        size === "xs" ? "size-4 text-[8px]" : "size-6 text-[10px]"
      )}
    >
      {member.initials}
    </span>
  )
}
