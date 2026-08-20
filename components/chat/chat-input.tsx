"use client"

import { useCallback, useState } from "react"

import { PromptBar } from "@/components/agent"
import { LoopMark } from "@/components/loop-logo"

export function ChatInput({
  isStreaming,
  onSend,
  onStop,
}: {
  isStreaming: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const [value, setValue] = useState("")

  const submit = useCallback(() => {
    const text = value.trim()
    if (!text || isStreaming) return
    onSend(text)
    setValue("")
  }, [value, isStreaming, onSend])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2">
      <PromptBar
        value={value}
        onValueChange={setValue}
        onSubmit={submit}
        isStreaming={isStreaming}
        onStop={onStop}
        showModelSelector={false}
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
