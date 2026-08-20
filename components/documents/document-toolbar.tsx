"use client"

import type { YHistoryEditor } from "@platejs/yjs"
import { insertEmptyCodeBlock } from "@platejs/code-block"
import { triggerFloatingLink } from "@platejs/link/react"
import { ListStyleType, toggleList } from "@platejs/list"
import { insertEquation, insertInlineEquation } from "@platejs/math"
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BracesIcon,
  Code2Icon,
  FileDownIcon,
  FileUpIcon,
  HighlighterIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MinusIcon,
  MoreHorizontalIcon,
  RadicalIcon,
  Redo2Icon,
  SquareSigmaIcon,
  SubscriptIcon,
  SuperscriptIcon,
  Undo2Icon,
} from "lucide-react"
import { KEYS, type Value } from "platejs"
import { useEditorRef } from "platejs/react"
import { useRef, useState, type ChangeEvent, type ComponentType } from "react"

import type { LoopDocumentEditor } from "@/components/documents/document-editor-kit"
import { SourceEmbedPicker } from "@/components/documents/source-embed-picker"
import { TableControls } from "@/components/documents/table-controls"
import {
  AutoformatToggle,
  LineNumberToggle,
} from "@/components/documents/editor-preference-controls"
import { FontSizeControls } from "@/components/documents/font-size-controls"
import { MarkToolbarButton } from "@/components/ui/mark-toolbar-button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Toolbar, ToolbarButton, ToolbarGroup } from "@/components/ui/toolbar"
import { projectEmbedsForMarkdown } from "@/lib/document-embeds"

const ALIGNMENTS = [
  { value: "left" as const, icon: AlignLeftIcon },
  { value: "center" as const, icon: AlignCenterIcon },
  { value: "right" as const, icon: AlignRightIcon },
  { value: "justify" as const, icon: AlignJustifyIcon },
]

const preserveSelection = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.preventDefault()
}

function replaceDocumentValue(editor: LoopDocumentEditor, value: Value) {
  const yjsEditor = editor as LoopDocumentEditor & YHistoryEditor
  yjsEditor.flushLocalChanges()
  yjsEditor.undoManager.stopCapturing()
  try {
    editor.tf.withNewBatch(() => editor.tf.setValue(value))
    yjsEditor.flushLocalChanges()
  } finally {
    yjsEditor.undoManager.stopCapturing()
  }
}

export function DocumentToolbar() {
  const editor = useEditorRef<LoopDocumentEditor>()
  const importInputRef = useRef<HTMLInputElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  const importMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const markdown = await file.text()
    replaceDocumentValue(editor, editor.api.markdown.deserialize(markdown))
    editor.tf.focus()
  }

  const exportMarkdown = () => {
    const markdown = editor.api.markdown.serialize({
      value: projectEmbedsForMarkdown(editor.children),
    })
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }))
    const anchor = globalThis.document.createElement("a")
    anchor.href = url
    anchor.download = "document.md"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="shrink-0 overflow-x-auto border-b border-line bg-surface px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <input
        ref={importInputRef}
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        onChange={(event) => void importMarkdown(event)}
        className="hidden"
      />
      <Toolbar className="mx-auto min-w-max justify-center">
        <ToolbarGroup>
          <ToolbarButton onClick={() => editor.undo()} aria-label="Undo" tooltip="Undo (⌘Z)">
            <Undo2Icon />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.redo()} aria-label="Redo" tooltip="Redo (⌘⇧Z)">
            <Redo2Icon />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup>
          <label className="relative">
            <span className="sr-only">Text style</span>
            <select
              defaultValue={KEYS.p}
              onChange={(event) => {
                const type = event.target.value
                if (type === KEYS.blockquote) editor.tf.blockquote.toggle()
                else editor.tf.setNodes({ type })
                editor.tf.focus()
              }}
              className="h-8 min-w-24 rounded-control bg-transparent px-2 text-[12px] font-medium text-ink outline-none transition-colors hover:bg-hover"
            >
              <option value={KEYS.p}>Paragraph</option>
              <option value={KEYS.h1}>Heading 1</option>
              <option value={KEYS.h2}>Heading 2</option>
              <option value={KEYS.h3}>Heading 3</option>
              <option value={KEYS.h4}>Heading 4</option>
              <option value={KEYS.h5}>Heading 5</option>
              <option value={KEYS.h6}>Heading 6</option>
              <option value={KEYS.blockquote}>Quote</option>
            </select>
          </label>
          <FontSizeControls />
        </ToolbarGroup>

        <ToolbarGroup>
          <MarkToolbarButton nodeType={KEYS.bold} aria-label="Bold" tooltip="Bold (⌘B)">
            <span className="font-bold">B</span>
          </MarkToolbarButton>
          <MarkToolbarButton nodeType={KEYS.italic} aria-label="Italic" tooltip="Italic (⌘I)">
            <span className="italic">I</span>
          </MarkToolbarButton>
          <MarkToolbarButton nodeType={KEYS.underline} aria-label="Underline" tooltip="Underline (⌘U)">
            <span className="underline">U</span>
          </MarkToolbarButton>
          <MarkToolbarButton nodeType={KEYS.strikethrough} aria-label="Strikethrough" tooltip="Strikethrough (⌘⇧X)">
            <span className="line-through">S</span>
          </MarkToolbarButton>
          <MarkToolbarButton nodeType={KEYS.code} aria-label="Inline code" tooltip="Inline code (⌘E)">
            <Code2Icon />
          </MarkToolbarButton>
          <MarkToolbarButton nodeType={KEYS.highlight} aria-label="Highlight" tooltip="Highlight (⌘⇧H)">
            <HighlighterIcon />
          </MarkToolbarButton>
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <ToolbarButton aria-label="More formatting" tooltip="More formatting">
                <MoreHorizontalIcon />
              </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-52 rounded-card p-1.5">
              <MenuButton icon={SuperscriptIcon} label="Superscript" shortcut="⌘." onClick={() => editor.tf.superscript.toggle()} onDone={() => setMoreOpen(false)} />
              <MenuButton icon={SubscriptIcon} label="Subscript" shortcut="⌘," onClick={() => editor.tf.subscript.toggle()} onDone={() => setMoreOpen(false)} />
              <MenuButton icon={RadicalIcon} label="Inline equation" onClick={() => insertInlineEquation(editor)} onDone={() => setMoreOpen(false)} />
              <MenuButton icon={SquareSigmaIcon} label="Block equation" onClick={() => insertEquation(editor)} onDone={() => setMoreOpen(false)} />
              <MenuButton icon={BracesIcon} label="Code block" onClick={() => insertEmptyCodeBlock(editor, { defaultType: KEYS.p, insertNodesOptions: { select: true } })} onDone={() => setMoreOpen(false)} />
              <div className="my-1 h-px bg-line" />
              <MenuButton icon={FileUpIcon} label="Import Markdown" onClick={() => importInputRef.current?.click()} onDone={() => setMoreOpen(false)} />
              <MenuButton icon={FileDownIcon} label="Export Markdown" onClick={exportMarkdown} onDone={() => setMoreOpen(false)} />
            </PopoverContent>
          </Popover>
        </ToolbarGroup>

        <ToolbarGroup>
          <ToolbarButton onMouseDown={preserveSelection} onClick={() => { toggleList(editor, { listStyleType: ListStyleType.Disc }); editor.tf.focus() }} aria-label="Bulleted list" tooltip="Bulleted list">
            <ListIcon />
          </ToolbarButton>
          <ToolbarButton onMouseDown={preserveSelection} onClick={() => { toggleList(editor, { listStyleType: ListStyleType.Decimal }); editor.tf.focus() }} aria-label="Numbered list" tooltip="Numbered list">
            <ListOrderedIcon />
          </ToolbarButton>
          <ToolbarButton onMouseDown={preserveSelection} onClick={() => { toggleList(editor, { listStyleType: KEYS.listTodo }); editor.tf.focus() }} aria-label="Task list" tooltip="Task list">
            <ListTodoIcon />
          </ToolbarButton>
          <ToolbarButton onMouseDown={preserveSelection} onClick={() => triggerFloatingLink(editor, { focused: true })} aria-label="Insert link" tooltip="Insert link (⌘K)">
            <Link2Icon />
          </ToolbarButton>
          <SourceEmbedPicker />
          <TableControls />
          <ToolbarButton onMouseDown={preserveSelection} onClick={() => { editor.tf.insertNodes({ type: KEYS.hr, children: [{ text: "" }] }); editor.tf.focus() }} aria-label="Horizontal rule" tooltip="Horizontal rule">
            <MinusIcon />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarGroup>
          {ALIGNMENTS.map(({ value, icon: Icon }) => (
            <ToolbarButton key={value} onMouseDown={preserveSelection} onClick={() => { editor.tf.textAlign.setNodes(value); editor.tf.focus() }} aria-label={`Align ${value}`} tooltip={`Align ${value}`}>
              <Icon />
            </ToolbarButton>
          ))}
        </ToolbarGroup>

        <ToolbarGroup>
          <LineNumberToggle />
          <AutoformatToggle />
        </ToolbarGroup>
      </Toolbar>
    </div>
  )
}

function MenuButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  onDone,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  onClick: () => void
  onDone: () => void
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onClick()
        onDone()
      }}
      className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-[12px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
    >
      <Icon className="size-3.5" />
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[10px] text-ink-3">{shortcut}</span>}
    </button>
  )
}
