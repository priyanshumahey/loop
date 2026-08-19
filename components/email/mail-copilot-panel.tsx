'use client'

import { CalendarDaysIcon, MailIcon, SparklesIcon } from 'lucide-react'
import { useCallback, useState } from 'react'

import { AgentTabs } from '@/components/cal/agent/agent-tabs'
import { CalAgent, type ContextEmail } from '@/components/cal/cal-agent'
import { MailCalendarPanel } from '@/components/email/mail-calendar-panel'
import { FollowUpSuggestions } from '@/components/agent'
import type { AgentEmail } from '@/lib/cal-agent/tools'
import { useAgentConversations } from '@/hooks/use-agent-conversations'
import { usePersistentState } from '@/hooks/use-persistent-state'
import { useSidebarResize } from '@/hooks/use-sidebar-resize'
import { cn } from '@/lib/utils'

type PanelMode = 'assistant' | 'calendar'

const PANEL_MODES: { value: PanelMode; label: string; icon: typeof MailIcon }[] = [
  { value: 'assistant', label: 'Assistant', icon: SparklesIcon },
  { value: 'calendar', label: 'Calendar', icon: CalendarDaysIcon },
]

/** Segmented control to swap the right rail between the assistant and calendar. */
function ModeToggle({
  mode,
  onChange,
}: {
  mode: PanelMode
  onChange: (mode: PanelMode) => void
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-control bg-inset p-0.5 shadow-hairline">
      {PANEL_MODES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          title={label}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium transition-colors',
            mode === value
              ? 'bg-surface text-ink'
              : 'text-ink-3 hover:text-ink'
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  )
}

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
      <span className="grid size-11 place-items-center rounded-card bg-ink text-canvas shadow-card">
        <MailIcon className="size-5" />
      </span>
      <div className="space-y-1">
        <h2 className="font-heading text-base font-medium">Loop assistant</h2>
        <p className="text-[13px] text-muted-foreground">
          Ask about your inbox — triage, summarize, or find a message.
        </p>
      </div>
      <FollowUpSuggestions
        items={SUGGESTIONS}
        onPick={onAsk}
        className="mx-0 max-w-xs px-0 pt-0 pb-0"
      />
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
  const [mode, setMode] = usePersistentState<PanelMode>(
    'loop:mail:right-panel-mode',
    'assistant'
  )
  const [isDragging, setIsDragging] = useState(false)
  const store = useAgentConversations()

  const toggle = useCallback(() => setCollapsed((c) => !c), [setCollapsed])

  // Keep the panel open while there's an email waiting to attach, so clicking
  // "Ask copilot" on the reader reveals the assistant automatically.
  const showCollapsed = collapsed && contextEmails.length === 0

  // Attaching an email is an assistant action, so force the assistant view
  // whenever there are emails pending attachment.
  const effectiveMode: PanelMode = contextEmails.length > 0 ? 'assistant' : mode

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
    const RailIcon = mode === 'calendar' ? CalendarDaysIcon : SparklesIcon
    const railLabel = mode === 'calendar' ? 'Calendar' : 'Ask agent'
    return (
      <div className="hidden h-svh shrink-0 py-2 pr-2 md:block">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title={mode === 'calendar' ? 'Open calendar' : 'Open assistant'}
          className="flex h-full w-11 flex-col items-center justify-between rounded-window bg-surface py-3 shadow-card transition-colors hover:bg-hover"
        >
          <RailIcon className="size-4 text-foreground" />
          <span
            className="text-[12px] font-medium tracking-wide text-muted-foreground"
            style={{ writingMode: 'vertical-rl' }}
          >
            {railLabel}
          </span>
          <RailIcon className="size-4 text-transparent" aria-hidden />
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

      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-window bg-surface shadow-card">
        {effectiveMode === 'calendar' ? (
          <MailCalendarPanel
            headerLeading={<ModeToggle mode={effectiveMode} onChange={setMode} />}
            onClose={() => setCollapsed(true)}
          />
        ) : (
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
            headerLeading={<ModeToggle mode={effectiveMode} onChange={setMode} />}
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
        )}
      </div>
    </div>
  )
}
