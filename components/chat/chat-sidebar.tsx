"use client"

import {
  ChevronDownIcon,
  MoreHorizontalIcon,
  PenSquareIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
  favoriteIds,
  onNewChat,
  onSelect,
  onDelete,
  onRename,
  onToggleFavorite,
}: {
  conversations: SidebarConversation[]
  activeId: string | null
  favoriteIds: string[]
  onNewChat: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onToggleFavorite: (id: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [favoritesOpen, setFavoritesOpen] = useState(true)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const favoriteSet = new Set(favoriteIds)
  const favorites = conversations
    .filter((c) => favoriteSet.has(c.id))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const groups = groupConversations(
    conversations.filter((c) => !favoriteSet.has(c.id))
  )

  const commitRename = (id: string) => {
    if (draftTitle.trim()) onRename(id, draftTitle)
    setEditingId(null)
  }

  const renderRow = (conv: SidebarConversation) => {
    const isFavorite = favoriteSet.has(conv.id)
    const isMenuOpen = menuOpenId === conv.id
    return (
      <div
        key={conv.id}
        className={cn(
          "group relative flex items-center rounded-lg px-2 py-[7px] text-[13px] transition-colors",
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
        <div className="absolute inset-y-0 right-0 flex items-center rounded-r-lg bg-inherit pl-6 pr-1.5">
          {isFavorite && (
            <StarIcon
              className={cn(
                "size-3.5 fill-current text-amber-500 group-hover:hidden",
                isMenuOpen && "hidden"
              )}
            />
          )}
          <Popover
            open={isMenuOpen}
            onOpenChange={(open) => setMenuOpenId(open ? conv.id : null)}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Conversation options"
                className={cn(
                  "hidden shrink-0 rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground group-hover:block",
                  isMenuOpen && "block text-foreground"
                )}
              >
                <MoreHorizontalIcon className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={4}
              className="w-44 rounded-lg p-1"
            >
              <button
                type="button"
                onClick={() => {
                  onToggleFavorite(conv.id)
                  setMenuOpenId(null)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted"
              >
                <StarIcon
                  className={cn(
                    "size-3.5",
                    isFavorite && "fill-current text-amber-500"
                  )}
                />
                {isFavorite ? "Remove from favorites" : "Add to favorites"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(conv.id)
                  setMenuOpenId(null)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2Icon className="size-3.5" />
                Delete
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    )
  }

  return (
    <AppSidebar
      active="chat"
      railAction={
        <button
          type="button"
          onClick={onNewChat}
          title="New chat"
          className="mt-1 grid size-9 place-items-center rounded-lg border border-border/70 bg-background text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <PenSquareIcon className="size-4" />
        </button>
      }
    >
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
          <>
            {favorites.length > 0 && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setFavoritesOpen((open) => !open)}
                  className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-medium text-muted-foreground/80 transition-colors hover:text-foreground"
                >
                  <ChevronDownIcon
                    className={cn(
                      "size-3 transition-transform",
                      !favoritesOpen && "-rotate-90"
                    )}
                  />
                  <StarIcon className="size-3 fill-current text-amber-500" />
                  Favorites
                  <span className="ml-0.5 text-muted-foreground/60">
                    {favorites.length}
                  </span>
                </button>
                {favoritesOpen && favorites.map(renderRow)}
              </div>
            )}

            {groups.map((group) => (
              <div key={group.label} className="mb-3">
                <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground/80">
                  {group.label}
                </div>
                {group.items.map(renderRow)}
              </div>
            ))}
          </>
        )}
      </div>
    </AppSidebar>
  )
}
