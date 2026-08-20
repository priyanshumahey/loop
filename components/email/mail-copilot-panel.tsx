'use client'

import { CalendarDaysIcon, MailIcon } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type CSSProperties,
} from 'react'

import { AgentTabs } from '@/components/cal/agent/agent-tabs'
import { CalAgent, type ContextEmail } from '@/components/cal/cal-agent'
import { MailCalendarPanel } from '@/components/email/mail-calendar-panel'
import { FollowUpSuggestions } from '@/components/agent'
import { LoopMark } from '@/components/loop-logo'
import type { AgentEmail } from '@/lib/cal-agent/tools'
import { useAgentConversations } from '@/hooks/use-agent-conversations'
import { usePersistentState } from '@/hooks/use-persistent-state'
import { useSidebarResize } from '@/hooks/use-sidebar-resize'
import { cn } from '@/lib/utils'

type PanelMode = 'assistant' | 'calendar'

const PANEL_MODES: {
  value: PanelMode
  label: string
  icon: ComponentType<{ className?: string }>
}[] = [
  { value: 'assistant', label: 'Assistant', icon: LoopMark },
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
          aria-label={label}
          title={label}
          className={cn(
            'grid size-7 place-items-center rounded-[6px] text-[12px] font-medium transition-colors sm:flex sm:w-auto sm:gap-1.5 sm:px-2',
            mode === value
              ? 'bg-surface text-ink'
              : 'text-ink-3 hover:text-ink'
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
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
  'Find mail related to my next meeting',
  'Turn an important thread into a document',
  'Check whether any proposed times conflict',
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
          Work across your inbox, calendar, and documents from one conversation.
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const store = useAgentConversations()

  const toggle = useCallback(() => setCollapsed((c) => !c), [setCollapsed])

  // Keep the panel open while there's an email waiting to attach, so clicking
  // "Ask copilot" on the reader reveals the assistant automatically.
  const showCollapsed = collapsed && contextEmails.length === 0

  // Attaching an email is an assistant action, so force the assistant view
  // whenever there are emails pending attachment.
  const effectiveMode: PanelMode = contextEmails.length > 0 ? 'assistant' : mode

  useEffect(() => {
    if (contextEmails.length === 0) return
    Promise.resolve().then(() => setMobileOpen(true))
  }, [contextEmails.length])

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

  const closePanel = useCallback(() => {
    setMobileOpen(false)
    setCollapsed(true)
  }, [setCollapsed])

  const RailIcon = mode === 'calendar' ? CalendarDaysIcon : LoopMark
  const railLabel = mode === 'calendar' ? 'Calendar' : 'Ask agent'

  return (
    <>
      {!mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open Loop assistant"
          title="Open Loop assistant"
          className="fixed bottom-4 right-4 z-40 grid size-11 place-items-center rounded-full bg-ink text-canvas shadow-raised md:hidden"
        >
          <LoopMark className="h-5 w-[17px]" />
        </button>
      )}

      {showCollapsed && (
      <div className="hidden h-svh shrink-0 py-2 pr-2 md:block">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title={mode === 'calendar' ? 'Open calendar' : 'Open assistant'}
          className="flex h-full w-11 flex-col items-center justify-between rounded-window bg-surface py-3 shadow-card transition-colors hover:bg-hover"
        >
          <RailIcon className="h-4 w-4 text-foreground" />
          <span
            className="text-[12px] font-medium tracking-wide text-muted-foreground"
            style={{ writingMode: 'vertical-rl' }}
          >
            {railLabel}
          </span>
          <RailIcon className="h-4 w-4 text-transparent" />
        </button>
      </div>
      )}

      <div
        className={cn(
          'h-svh w-full p-2 md:w-[var(--panel-width)] md:shrink-0 md:py-2 md:pr-2 md:pl-0',
          mobileOpen ? 'fixed inset-0 z-50 block' : 'hidden',
          showCollapsed
            ? 'md:hidden'
            : 'md:relative md:inset-auto md:z-auto md:block',
          !isDragging && 'md:transition-[width] md:duration-200 md:ease-linear'
        )}
        style={{ '--panel-width': width } as CSSProperties}
      >
        {/* Drag rail on the left edge */}
        <button
          ref={dragRef}
          type="button"
          aria-label="Resize assistant panel"
          tabIndex={-1}
          onMouseDown={handleMouseDown}
          title="Resize assistant panel"
          className="group/rail absolute inset-y-0 left-0 z-20 hidden w-4 -translate-x-1/2 cursor-w-resize after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:transition-colors hover:after:bg-border md:flex"
        />

        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-window bg-surface shadow-card">
          {effectiveMode === 'calendar' ? (
            <MailCalendarPanel
              headerLeading={<ModeToggle mode={effectiveMode} onChange={setMode} />}
              onClose={closePanel}
            />
          ) : (
            <CalAgent
              key={store.activeId}
              surface="mail"
              conversationId={store.activeId}
              initialMessages={store.activeConversation?.messages}
              onPersist={store.persist}
              onClose={closePanel}
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
    </>
  )
}
