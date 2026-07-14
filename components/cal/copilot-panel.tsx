"use client"

import { SparklesIcon } from "lucide-react"
import { useCallback, useState } from "react"

import { CalAgent } from "@/components/cal/cal-agent"
import { AgentTabs } from "@/components/cal/agent/agent-tabs"
import type { AgentEvent } from "@/lib/cal-agent/tools"
import { useAgentConversations } from "@/hooks/use-agent-conversations"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { useSidebarResize } from "@/hooks/use-sidebar-resize"
import { cn } from "@/lib/utils"

const DEFAULT_WIDTH = "24rem"
const MIN_WIDTH = "20rem"
const MAX_WIDTH = "34rem"

/**
 * A resizable AI assistant panel docked to the right edge. Drag the left rail
 * to resize; drag past the minimum (or click the rail / collapse button) to
 * hide it. Hosts the AI SDK calendar agent.
 */
export function CopilotPanel({
  onOpenEvent,
  onMutated,
}: {
  onOpenEvent?: (event: AgentEvent) => void
  onMutated?: (action: "create" | "update" | "delete", event?: AgentEvent) => void
} = {}) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = usePersistentState(
    "loop:copilot:collapsed",
    false
  )
  const [isDragging, setIsDragging] = useState(false)
  const store = useAgentConversations()

  const toggle = useCallback(() => setCollapsed((c) => !c), [])

  const { dragRef, handleMouseDown } = useSidebarResize({
    direction: "left",
    currentWidth: width,
    onResize: setWidth,
    onToggle: toggle,
    isCollapsed: collapsed,
    minResizeWidth: MIN_WIDTH,
    maxResizeWidth: MAX_WIDTH,
    setIsDraggingRail: setIsDragging,
    widthCookieName: "loop_copilot_width",
  })

  if (collapsed) {
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
            style={{ writingMode: "vertical-rl" }}
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
        "relative hidden h-svh shrink-0 py-2 pr-2 md:block",
        !isDragging && "transition-[width] duration-200 ease-linear"
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

      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
        <CalAgent
          key={store.activeId}
          conversationId={store.activeId}
          initialMessages={store.activeConversation?.messages}
          onPersist={store.persist}
          onClose={() => setCollapsed(true)}
          onOpenEvent={onOpenEvent}
          onMutated={onMutated}
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
