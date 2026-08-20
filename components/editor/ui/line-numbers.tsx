"use client"

import { useElement, usePath } from "platejs/react"

import { useLineNumbersOptional } from "@/components/editor/line-numbers-context"
import { cn } from "@/lib/utils"

const INDENT_OFFSET = 24

export function BlockLineNumber({ className }: { className?: string }) {
  const path = usePath()
  const element = useElement()
  const showLineNumbers = useLineNumbersOptional()

  if (!showLineNumbers) return null

  const lineNumber = path?.[0] + 1
  const indent = (element as { indent?: number }).indent ?? 0

  return (
    <span
      className={cn(
        "pointer-events-none absolute top-0 flex h-[1.72em] w-10 select-none items-start justify-end font-mono text-[10px] leading-[1.72em] text-ink-3/55",
        className
      )}
      style={{ left: `calc(-3rem - ${indent * INDENT_OFFSET}px)` }}
      contentEditable={false}
      data-plate-prevent-copy
    >
      {lineNumber}
    </span>
  )
}
