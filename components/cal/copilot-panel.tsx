"use client"

import { useDroppable } from "@dnd-kit/core"
import { CalendarPlusIcon } from "lucide-react"
import { useCallback, useEffect, useState, type CSSProperties } from "react"

import { CalAgent, type ContextEvent } from "@/components/cal/cal-agent"
import { AgentTabs } from "@/components/cal/agent/agent-tabs"
import { useCalendarDnd } from "@/components/event-calendar/calendar-dnd-context"
import { LoopMark } from "@/components/loop-logo"
import type { AgentEvent } from "@/lib/cal-agent/tools"
import { useAgentConversations } from "@/hooks/use-agent-conversations"
import { useSidebarResize } from "@/hooks/use-sidebar-resize"
import { cn } from "@/lib/utils"

const DEFAULT_WIDTH = "24rem"
const MIN_WIDTH = "20rem"
const MAX_WIDTH = "34rem"

/**
 * A resizable AI assistant panel docked to the right edge. Hosts the shared AI
 * SDK workspace agent.
 *
 * The whole panel is a drop target: dragging a calendar event onto it attaches
 * the event as context for the next message.
 */
export function CopilotPanel({
  onOpenEvent,
  onMutated,
  contextEvents = [],
  onRemoveContextEvent,
  onClearContextEvents,
}: {
  onOpenEvent?: (event: AgentEvent) => void
  onMutated?: (action: "create" | "update" | "delete", event?: AgentEvent) => void
  /** Events dragged onto the panel, pending attachment to the next message. */
  contextEvents?: ContextEvent[]
  /** Remove one pending context event. */
  onRemoveContextEvent?: (id: string) => void
  /** Clear all pending context events (after a message is sent). */
  onClearContextEvents?: () => void
} = {}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [agentOpen, setAgentOpen] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const store = useAgentConversations()

  const { activeEvent } = useCalendarDnd()
  const { setNodeRef, isOver } = useDroppable({
    id: "calendar-agent-dropzone",
    data: { dropZone: "agent" },
  })
  const isEventOver = Boolean(activeEvent) && isOver

  const panelOpen = agentOpen || contextEvents.length > 0

  useEffect(() => {
    if (contextEvents.length === 0) return
    Promise.resolve().then(() => setAgentOpen(true))
  }, [contextEvents.length])

  const { dragRef, handleMouseDown } = useSidebarResize({
    direction: "left",
    currentWidth: width,
    onResize: setWidth,
    minResizeWidth: MIN_WIDTH,
    maxResizeWidth: MAX_WIDTH,
    enableAutoCollapse: false,
    enableToggle: false,
    isNested: true,
    setIsDraggingRail: setIsDragging,
    widthCookieName: "loop_copilot_width",
  })

  const closePanel = useCallback(() => {
    setAgentOpen(false)
  }, [])

  return (
    <>
      {!panelOpen && (
        <button
          ref={setNodeRef}
          type="button"
          onClick={() => setAgentOpen(true)}
          aria-label="Open Loop assistant"
          title="Open Loop assistant"
          className={cn(
            "fixed bottom-6 right-6 z-40 grid size-10 place-items-center rounded-full bg-ink text-canvas shadow-raised transition-transform hover:scale-[1.04]",
            isEventOver && "ring-2 ring-primary/40"
          )}
        >
          <LoopMark className="h-5 w-[17px]" />
        </button>
      )}

      {panelOpen && (
      <aside
        className={cn(
          "fixed inset-0 z-40 h-svh w-full p-2 md:relative md:inset-auto md:z-auto md:w-[min(390px,44vw)] md:shrink-0 md:pl-0 lg:w-[var(--panel-width)]",
          !isDragging && "lg:transition-[width] lg:duration-150 lg:ease-linear"
        )}
        style={{ "--panel-width": width } as CSSProperties}
      >
        {/* Drag rail on the left edge */}
        <button
          ref={dragRef}
          type="button"
          aria-label="Resize assistant panel"
          tabIndex={-1}
          onMouseDown={handleMouseDown}
          title="Resize assistant panel"
          className="group/rail absolute inset-y-0 left-0 z-20 hidden w-4 -translate-x-1/2 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:transition-colors hover:after:bg-border lg:block"
        />

        <div
          ref={setNodeRef}
          className={cn(
            "relative flex h-full w-full flex-col overflow-hidden rounded-window bg-surface shadow-card transition-shadow",
            isEventOver && "ring-2 ring-primary/40"
          )}
        >
          {/* Drop hint overlay shown while dragging an event over the panel */}
          {isEventOver && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-window bg-primary/5 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-card bg-surface px-3 py-2 text-[13px] font-medium text-ink shadow-raised">
                <CalendarPlusIcon className="size-4 text-primary" />
                Drop to add as context
              </div>
            </div>
          )}
          <CalAgent
            key={store.activeId}
            surface="calendar"
            conversationId={store.activeId}
            initialMessages={store.activeConversation?.messages}
            onPersist={store.persist}
            onClose={closePanel}
            onOpenEvent={onOpenEvent}
            onMutated={onMutated}
            contextEvents={contextEvents}
            onRemoveContextEvent={onRemoveContextEvent}
            onClearContextEvents={onClearContextEvents}
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
      </aside>
      )}
    </>
  )
}
