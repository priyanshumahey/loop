"use client"

import {
  CalendarIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PenSquareIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { LoopMark } from "@/components/loop-logo"
import { UserAccount } from "@/components/user-account"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { cn } from "@/lib/utils"

/** Minimal shape the sidebar needs — works with any conversation store. */
export interface SidebarConversation {
  id: string
  title: string
  updatedAt: number
}

type ConversationGroup = { label: string; items: SidebarConversation[] }

function groupConversations(conversations: SidebarConversation[]): ConversationGroup[] {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
  const now = Date.now()
  const day = 1000 * 60 * 60 * 24
  const buckets: Record<string, SidebarConversation[]> = {}
  const order = ["Today", "Yesterday", "This week", "This month", "Older"]

  for (const conv of sorted) {
    const diffDays = Math.floor((now - conv.updatedAt) / day)
    let label: string
    if (diffDays === 0) label = "Today"
    else if (diffDays === 1) label = "Yesterday"
    else if (diffDays < 7) label = "This week"
    else if (diffDays < 30) label = "This month"
    else label = "Older"
    ;(buckets[label] ??= []).push(conv)
  }

  return order
    .filter((label) => buckets[label]?.length)
    .map((label) => ({ label, items: buckets[label] }))
}

export function ChatSidebar({
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onDelete,
  onRename,
}: {
  conversations: SidebarConversation[]
  activeId: string | null
  onNewChat: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")

  const groups = groupConversations(conversations)

  const commitRename = (id: string) => {
    if (draftTitle.trim()) onRename(id, draftTitle)
    setEditingId(null)
  }

  const [collapsed, setCollapsed] = usePersistentState(
    "loop:chat:sidebar-collapsed",
    false
  )

  if (collapsed) {
    return (
      <div className="flex h-svh w-14 shrink-0 flex-col items-center gap-2 px-2 py-3">
        <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
          <LoopMark className="h-4 w-[13px]" />
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpenIcon className="size-4" />
        </button>

        {/* View switcher */}
        <div className="mt-1 flex flex-col items-center gap-1 rounded-xl bg-muted/70 p-1">
          <span
            title="Chat"
            className="grid size-8 place-items-center rounded-lg bg-background text-foreground shadow-sm"
          >
            <SparklesIcon className="size-4" />
          </span>
          <Link
            href="/cal"
            title="Calendar"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <CalendarIcon className="size-4" />
          </Link>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          title="New chat"
          className="mt-1 grid size-9 place-items-center rounded-lg border border-border/70 bg-background text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <PenSquareIcon className="size-4" />
        </button>

        <div className="mt-auto border-t border-border/60 pt-2">
          <UserAccount collapsed />
        </div>
      </div>
    )
  }

  return (
    <aside className="flex h-svh w-[264px] shrink-0 flex-col gap-1 px-3 py-3 text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
            <LoopMark className="h-4 w-[13px]" />
          </span>
          <span className="font-heading text-[15px] font-semibold tracking-tight">Loop</span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeftCloseIcon className="size-4" />
        </button>
      </div>

      {/* View switcher */}
      <div className="flex items-center gap-1 rounded-xl bg-muted/70 p-1">
        <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-background px-2.5 py-1.5 text-[13px] font-medium text-foreground shadow-sm">
          <SparklesIcon className="size-3.5" />
          Chat
        </span>
        <Link
          href="/cal"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <CalendarIcon className="size-3.5" />
          Calendar
        </Link>
      </div>

      {/* New chat */}
      <button
        type="button"
        onClick={onNewChat}
        className="mt-1 flex w-full items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60"
      >
        <PenSquareIcon className="size-4" />
        New chat
      </button>

      {/* Conversation list */}
      <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1">
        {conversations.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            No conversations yet.
            <br />
            Start a new chat to begin.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground/80">
                {group.label}
              </div>
              {group.items.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "group flex items-center gap-1.5 rounded-lg px-2 py-[7px] text-[13px] transition-colors",
                    activeId === conv.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  {editingId === conv.id ? (
                    <input
                      value={draftTitle}
                      autoFocus
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={() => commitRename(conv.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(conv.id)
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      className="h-5 flex-1 rounded border border-border bg-background px-1 text-[13px] outline-none focus-visible:border-ring"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelect(conv.id)}
                      onDoubleClick={() => {
                        setEditingId(conv.id)
                        setDraftTitle(conv.title)
                      }}
                      className="min-w-0 flex-1 truncate text-left"
                      title={conv.title}
                    >
                      {conv.title}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Delete conversation"
                    onClick={() => onDelete(conv.id)}
                    className="shrink-0 rounded p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Account */}
      <div className="mt-1 border-t border-border/60 pt-1">
        <UserAccount />
      </div>
    </aside>
  )
}
