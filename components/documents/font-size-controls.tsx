"use client"

import { toUnitLess } from "@platejs/basic-styles"
import { FontSizePlugin } from "@platejs/basic-styles/react"
import { MinusIcon, PlusIcon } from "lucide-react"
import { KEYS } from "platejs"
import { useEditorPlugin, useEditorSelector } from "platejs/react"
import { useState } from "react"

const DEFAULT_FONT_SIZE = "16"

export function FontSizeControls() {
  const { editor, tf } = useEditorPlugin(FontSizePlugin)
  const [inputValue, setInputValue] = useState("")
  const [editing, setEditing] = useState(false)
  const cursorFontSize = useEditorSelector((currentEditor) => {
    const fontSize = currentEditor.api.marks()?.[KEYS.fontSize]
    return fontSize ? toUnitLess(fontSize as string) : DEFAULT_FONT_SIZE
  }, [])

  const change = (delta: number) => {
    const current = Number(cursorFontSize) || 16
    const next = Math.max(8, Math.min(72, current + delta))
    tf.fontSize.addMark(`${next}px`)
    editor.tf.focus()
  }

  const submit = () => {
    const next = Number.parseInt(inputValue, 10)
    if (Number.isFinite(next) && next >= 8 && next <= 72) {
      tf.fontSize.addMark(`${next}px`)
    }
    setEditing(false)
    editor.tf.focus()
  }

  return (
    <div className="flex h-7 items-center overflow-hidden rounded-control bg-field shadow-hairline">
      <button
        type="button"
        onClick={() => change(-2)}
        aria-label="Decrease font size"
        className="grid h-full w-6 place-items-center text-ink-3 transition-colors hover:bg-hover hover:text-ink"
      >
        <MinusIcon className="size-3" />
      </button>
      {editing ? (
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value.replace(/[^0-9]/g, ""))}
          onBlur={submit}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit()
            if (event.key === "Escape") {
              setEditing(false)
              editor.tf.focus()
            }
          }}
          autoFocus
          aria-label="Font size"
          className="h-full w-8 bg-transparent text-center text-[11px] text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setInputValue(cursorFontSize)
            setEditing(true)
          }}
          aria-label={`Font size ${cursorFontSize}`}
          className="h-full w-8 text-[11px] tabular-nums text-ink-2 transition-colors hover:bg-hover hover:text-ink"
        >
          {cursorFontSize}
        </button>
      )}
      <button
        type="button"
        onClick={() => change(2)}
        aria-label="Increase font size"
        className="grid h-full w-6 place-items-center text-ink-3 transition-colors hover:bg-hover hover:text-ink"
      >
        <PlusIcon className="size-3" />
      </button>
    </div>
  )
}
