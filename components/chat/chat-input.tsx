"use client"

import { useCallback, useState } from "react"

import { PromptBar } from "@/components/agent"
import { LoopMark } from "@/components/loop-logo"
import type { AgentContextItem } from "@/lib/agent-context"

export function ChatInput({
  isStreaming,
  onSend,
  onStop,
}: {
  isStreaming: boolean
  onSend: (text: string, contextItems: AgentContextItem[]) => void
  onStop: () => void
}) {
  const [value, setValue] = useState("")
  const [contextItems, setContextItems] = useState<AgentContextItem[]>([])

  const submit = useCallback((submittedValue: string) => {
    const text = submittedValue.trim()
    if ((!text && contextItems.length === 0) || isStreaming) return
    onSend(text, contextItems)
    setValue("")
    setContextItems([])
  }, [contextItems, isStreaming, onSend])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2">
      <PromptBar
        value={value}
        onValueChange={setValue}
        onSubmit={submit}
        isStreaming={isStreaming}
        onStop={onStop}
        showModelSelector={false}
        contextItems={contextItems}
        onContextItemsChange={setContextItems}
        footerLeading={
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-xs font-medium text-muted-foreground">
            <LoopMark className="h-3.5 w-3" />
            Loop
          </span>
        }
      />
    </div>
  )
}
