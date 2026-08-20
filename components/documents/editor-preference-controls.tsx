"use client"

import { HashIcon, SparklesIcon } from "lucide-react"

import { useAutoformat } from "@/components/editor/autoformat-context"
import { useLineNumbers } from "@/components/editor/line-numbers-context"
import { ToolbarButton } from "@/components/ui/toolbar"

export function LineNumberToggle() {
  const { showLineNumbers, toggleLineNumbers } = useLineNumbers()
  return (
    <ToolbarButton
      pressed={showLineNumbers}
      onClick={toggleLineNumbers}
      aria-label={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
      tooltip="Toggle line numbers"
    >
      <HashIcon />
    </ToolbarButton>
  )
}

export function AutoformatToggle() {
  const { isAutoformatEnabled, toggleAutoformat } = useAutoformat()
  return (
    <ToolbarButton
      pressed={isAutoformatEnabled}
      onClick={toggleAutoformat}
      aria-label={isAutoformatEnabled ? "Disable autoformat" : "Enable autoformat"}
      tooltip="Toggle autoformat"
    >
      <SparklesIcon />
    </ToolbarButton>
  )
}