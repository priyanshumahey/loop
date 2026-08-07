"use client"

import { ArrowUpIcon, SquareIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    resize()
  }, [value, resize])

  const submit = useCallback(() => {
    const text = value.trim()
    if (!text || isStreaming) return
    onSend(text)
    setValue("")
  }, [value, isStreaming, onSend])

  const canSend = value.trim().length > 0

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2">
      <div className="rounded-[22px] border border-border/70 bg-background p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] transition-colors focus-within:border-ring/60">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder="Ask anything…"
          className={cn(
            "max-h-50 w-full resize-none bg-transparent px-2.5 pt-1.5 pb-1 text-[15px] leading-relaxed outline-none",
            "placeholder:text-muted-foreground/60"
          )}
        />
        <div className="flex items-center justify-between px-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-border/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Loop
            </span>
          </div>

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              className="grid size-8 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"
            >
              <SquareIcon className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send"
              className={cn(
                "grid size-8 place-items-center rounded-full transition-all",
                canSend
                  ? "bg-foreground text-background hover:opacity-90"
                  : "bg-muted text-muted-foreground/50"
              )}
            >
              <ArrowUpIcon className="size-[18px]" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
