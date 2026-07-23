'use client'

import { MailIcon, SparklesIcon } from 'lucide-react'
import { useCallback, useState } from 'react'

import { AgentTabs } from '@/components/cal/agent/agent-tabs'
import { CalAgent, type ContextEmail } from '@/components/cal/cal-agent'
import type { AgentEmail } from '@/lib/cal-agent/tools'
import { useAgentConversations } from '@/hooks/use-agent-conversations'
import { usePersistentState } from '@/hooks/use-persistent-state'
import { useSidebarResize } from '@/hooks/use-sidebar-resize'
import { cn } from '@/lib/utils'

const DEFAULT_WIDTH = '24rem'
const MIN_WIDTH = '20rem'
const MAX_WIDTH = '34rem'

const SUGGESTIONS = [
  'Summarize my unread emails',
  'What needs a reply today?',
  'Any important mail this week?',
  'Show my latest emails',
]

function MailBriefing({ onAsk }: { onAsk: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-11 place-items-center rounded-2xl bg-foreground text-background">
        <MailIcon className="size-5" />
      </span>
      <div className="space-y-1">
        <h2 className="font-heading text-base font-medium">Loop assistant</h2>
        <p className="text-[13px] text-muted-foreground">
          Ask about your inbox — triage, summarize, or find a message.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onAsk(s)}
            className="rounded-xl border border-border/70 bg-background px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted/60"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A resizable AI assistant panel docked to the right of the mail page, mirroring
 * the calendar copilot: same conversation store, tabs, resize rail, and collapse
 * behavior. Email results the agent returns open inline in the reader.
 */
export function MailCopilotPanel({
  onOpenEmail,
  contextEmails = [],
  onRemoveContextEmail,
  onClearContextEmails,
}: {
  onOpenEmail?: (email: AgentEmail) => void
  /** Emails attached from the reader, pending attachment to the next message. */
  contextEmails?: ContextEmail[]
  onRemoveContextEmail?: (id: string) => void
  onClearContextEmails?: () => void
}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = usePersistentState(
    'loop:copilot:collapsed',
    false
  )
  const [isDragging, setIsDragging] = useState(false)
  const store = useAgentConversations()

  const toggle = useCallback(() => setCollapsed((c) => !c), [setCollapsed])

  // Keep the panel open while there's an email waiting to attach, so clicking
  // "Ask copilot" on the reader reveals the assistant automatically.
  const showCollapsed = collapsed && contextEmails.length === 0

  const { dragRef, handleMouseDown } = useSidebarResize({
    direction: 'left',
    currentWidth: width,
    onResize: setWidth,
    onToggle: toggle,
    isCollapsed: collapsed,
    minResizeWidth: MIN_WIDTH,
    maxResizeWidth: MAX_WIDTH,
    setIsDraggingRail: setIsDragging,
    widthCookieName: 'loop_copilot_width',
  })

  if (showCollapsed) {
    return (
      <div className="hidden h-svh shrink-0 py-2 pr-2 md:block">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Open assistant"
          className="flex h-full w-11 flex-col items-center justify-between rounded-2xl border border-border/70 bg-background py-3 shadow-sm transition-colors hover:bg-muted"
        >
          <SparklesIcon className="size-4 text-foreground" />
          <span
            className="text-[12px] font-medium tracking-wide text-muted-foreground"
            style={{ writingMode: 'vertical-rl' }}
          >
            Ask agent
          </span>
          <SparklesIcon className="size-4 text-transparent" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative hidden h-svh shrink-0 py-2 pr-2 md:block',
        !isDragging && 'transition-[width] duration-200 ease-linear'
      )}
      style={{ width }}
    >
      {/* Drag rail on the left edge */}
      <button
        ref={dragRef}
        type="button"
        aria-label="Resize assistant panel"
        tabIndex={-1}
        onMouseDown={handleMouseDown}
        title="Resize assistant panel"
        className="group/rail absolute inset-y-0 left-0 z-20 flex w-4 -translate-x-1/2 cursor-w-resize after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:transition-colors hover:after:bg-border"
      />

      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
        <CalAgent
          key={store.activeId}
          conversationId={store.activeId}
          initialMessages={store.activeConversation?.messages}
          onPersist={store.persist}
          onClose={() => setCollapsed(true)}
          onOpenEmail={onOpenEmail}
          contextEmails={contextEmails}
          onRemoveContextEmail={onRemoveContextEmail}
          onClearContextEmails={onClearContextEmails}
          renderEmptyState={(onAsk) => <MailBriefing onAsk={onAsk} />}
          tabBar={
            <AgentTabs
              openConversations={store.openConversations}
              conversations={store.conversations}
              activeId={store.activeId}
              isDraft={store.isDraft}
              onNewChat={store.newChat}
              onSelect={store.select}
              onCloseTab={store.closeTab}
              onDelete={store.remove}
            />
          }
        />
      </div>
    </div>
  )
}
