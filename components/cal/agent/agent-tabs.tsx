"use client"

import {
  ChevronDownIcon,
  MessagesSquareIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useState } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { AgentConversation } from "@/hooks/use-agent-conversations"
import { cn } from "@/lib/utils"

/**
 * Compact conversation switcher for the docked calendar panel: a "New chat"
 * pseudo-tab, one tab per open conversation (with a close button), and a
 * History popover to reopen or delete any past conversation. Closing a tab
 * only removes it from the strip — the conversation stays in History.
 */
export function AgentTabs({
  openConversations,
  conversations,
  activeId,
  isDraft,
  onNewChat,
  onSelect,
  onCloseTab,
  onDelete,
}: {
  openConversations: AgentConversation[]
  conversations: AgentConversation[]
  activeId: string | null
  isDraft: boolean
  onNewChat: () => void
  onSelect: (id: string) => void
  onCloseTab: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const openIds = new Set(openConversations.map((c) => c.id))
  const recent = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
  const activeConversation = conversations.find((c) => c.id === activeId)
  const mobileTitle = isDraft
    ? "New conversation"
    : activeConversation?.title ?? "Conversations"

  return (
    <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-line bg-inset/50 px-2 sm:h-auto sm:gap-1 sm:py-1">
      <button
        type="button"
        onClick={onNewChat}
        aria-label="New chat"
        title="New chat"
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink sm:inline-flex sm:h-7 sm:w-auto sm:gap-1 sm:px-2 sm:text-xs",
          isDraft && "bg-surface text-ink shadow-btn"
        )}
      >
        <PlusIcon className="size-3.5" />
        <span className="hidden sm:inline">New chat</span>
      </button>

      {/* Desktop open tabs. Mobile uses the conversation selector below. */}
      <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden">
        {openConversations.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-control pl-2 pr-1 transition-colors",
              activeId === conv.id
                ? "bg-surface text-ink"
                : "text-ink-3 hover:bg-hover hover:text-ink"
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(conv.id)}
              className="max-w-[120px] truncate text-xs"
              title={conv.title}
            >
              {conv.title}
            </button>
            <button
              type="button"
              onClick={() => onCloseTab(conv.id)}
              className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-muted-foreground/10 hover:text-foreground"
              aria-label="Close tab"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        ))}
      </div>

      {/* On mobile this is the active conversation selector; on desktop, History. */}
      <Popover
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open)
          if (!open) setConfirmDeleteId(null)
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Conversation history"
            className={cn(
              "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-control bg-surface px-2.5 text-xs text-ink shadow-btn transition-colors hover:bg-hover sm:h-7 sm:flex-none sm:bg-transparent sm:px-2 sm:text-ink-3 sm:shadow-none sm:hover:text-ink",
              historyOpen && "bg-surface text-ink"
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-1.5 sm:hidden">
              <MessagesSquareIcon className="size-3.5 shrink-0 text-ink-3" />
              <span className="truncate">{mobileTitle}</span>
            </span>
            <span className="hidden sm:inline">History</span>
            <ChevronDownIcon
              className={cn(
                "size-3 shrink-0 transition-transform",
                historyOpen && "rotate-180"
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[min(20rem,calc(100vw-1rem))] p-0 sm:w-64"
        >
          <div className="bg-inset px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-ink-3">
            Recent conversations
          </div>
          <div className="h-px bg-line" />
          <div className="max-h-72 overflow-y-auto p-1">
            {recent.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No conversations yet
              </p>
            ) : (
              recent.map((conv) => {
                const isConfirming = confirmDeleteId === conv.id
                return (
                  <div
                    key={conv.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-control px-2 py-1.5 text-xs hover:bg-hover",
                      activeId === conv.id
                        ? "bg-inset text-ink"
                        : openIds.has(conv.id)
                          ? "text-ink"
                          : "text-ink-3"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(conv.id)
                        setHistoryOpen(false)
                      }}
                      className="min-w-0 flex-1 truncate text-left"
                      title={conv.title}
                    >
                      {conv.title}
                    </button>
                    {isConfirming ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDelete(conv.id)
                            setConfirmDeleteId(null)
                          }}
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label="Delete conversation"
                        onClick={() => setConfirmDeleteId(conv.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground/70 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
