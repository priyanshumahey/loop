"use client"

import { SparklesIcon } from "lucide-react"
import { useCallback, useState } from "react"

import { PromptBar } from "@/components/agent"

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
        footerLeading={
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-xs font-medium text-muted-foreground">
            <SparklesIcon className="size-3" />
            Loop
          </span>
        }
      />
    </div>
  )
}
