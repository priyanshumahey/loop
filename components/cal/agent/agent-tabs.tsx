"use client"

import { ChevronDownIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
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

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-2 py-1.5">
      {/* Scrollable open tabs */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={onNewChat}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
            isDraft
              ? "border-border bg-muted text-foreground"
              : "border-transparent text-muted-foreground hover:bg-muted/60"
          )}
        >
          <PlusIcon className="size-3.5" />
          New chat
        </button>

        {openConversations.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border pl-2 pr-1",
              activeId === conv.id
                ? "border-border bg-muted text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/60"
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

      {/* History popover — outside the scroll area so it never clips */}
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
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
              "border-transparent text-muted-foreground hover:bg-muted/60",
              historyOpen && "border-border bg-muted text-foreground"
            )}
          >
            History
            <ChevronDownIcon
              className={cn("size-3 transition-transform", historyOpen && "rotate-180")}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-64 p-0">
          <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Recent conversations
          </div>
          <div className="h-px bg-border" />
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
                      "group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60",
                      openIds.has(conv.id) ? "text-foreground" : "text-muted-foreground"
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
                        className="shrink-0 rounded p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
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
