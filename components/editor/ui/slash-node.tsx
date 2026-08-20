"use client"

import {
  Combobox,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  Portal,
  useComboboxStore,
} from "@ariakit/react"
import {
  useComboboxInput,
  useHTMLInputCursorState,
} from "@platejs/combobox/react"
import { insertEmptyCodeBlock } from "@platejs/code-block"
import { ListStyleType, toggleList } from "@platejs/list"
import { insertEquation, insertInlineEquation } from "@platejs/math"
import { TablePlugin } from "@platejs/table/react"
import {
  BracesIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  RadicalIcon,
  SquareSigmaIcon,
  Table2Icon,
  type LucideIcon,
} from "lucide-react"
import {
  KEYS,
  type PointRef,
  type TComboboxInputElement,
} from "platejs"
import {
  PlateElement,
  type PlateEditor,
  type PlateElementProps,
} from "platejs/react"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

interface SlashCommand {
  icon: LucideIcon
  keywords: string[]
  label: string
  run: (editor: PlateEditor) => void
  value: string
}

interface SlashCommandGroup {
  label: string
  commands: SlashCommand[]
}

function setTextBlock(editor: PlateEditor, type: string) {
  editor.tf.withoutNormalizing(() => {
    editor.tf.unsetNodes([KEYS.listType, "indent"])
    editor.tf.setNodes({ type })
  })
  editor.tf.focus()
}

const COMMAND_GROUPS: SlashCommandGroup[] = [
  {
    label: "Text",
    commands: [
      {
        icon: PilcrowIcon,
        keywords: ["paragraph", "plain"],
        label: "Text",
        run: (editor) => setTextBlock(editor, KEYS.p),
        value: "text",
      },
      {
        icon: Heading1Icon,
        keywords: ["title", "h1"],
        label: "Heading 1",
        run: (editor) => setTextBlock(editor, KEYS.h1),
        value: "heading-1",
      },
      {
        icon: Heading2Icon,
        keywords: ["subtitle", "h2"],
        label: "Heading 2",
        run: (editor) => setTextBlock(editor, KEYS.h2),
        value: "heading-2",
      },
      {
        icon: Heading3Icon,
        keywords: ["subtitle", "h3"],
        label: "Heading 3",
        run: (editor) => setTextBlock(editor, KEYS.h3),
        value: "heading-3",
      },
      {
        icon: QuoteIcon,
        keywords: ["blockquote", "citation"],
        label: "Quote",
        run: (editor) => {
          editor.tf.blockquote.toggle()
          editor.tf.focus()
        },
        value: "quote",
      },
    ],
  },
  {
    label: "Lists",
    commands: [
      {
        icon: ListIcon,
        keywords: ["bullet", "unordered", "ul"],
        label: "Bulleted list",
        run: (editor) => {
          toggleList(editor, { listStyleType: ListStyleType.Disc })
          editor.tf.focus()
        },
        value: "bulleted-list",
      },
      {
        icon: ListOrderedIcon,
        keywords: ["number", "ordered", "ol"],
        label: "Numbered list",
        run: (editor) => {
          toggleList(editor, { listStyleType: ListStyleType.Decimal })
          editor.tf.focus()
        },
        value: "numbered-list",
      },
      {
        icon: ListTodoIcon,
        keywords: ["check", "task", "todo"],
        label: "To-do list",
        run: (editor) => {
          toggleList(editor, { listStyleType: KEYS.listTodo })
          editor.tf.focus()
        },
        value: "todo-list",
      },
    ],
  },
  {
    label: "Insert",
    commands: [
      {
        icon: Table2Icon,
        keywords: ["grid", "rows", "columns", "gfm"],
        label: "Table",
        run: (editor) =>
          editor
            .getTransforms(TablePlugin)
            .insert.table(
              { colCount: 3, header: true, rowCount: 3 },
              { select: true }
            ),
        value: "table",
      },
      {
        icon: BracesIcon,
        keywords: ["code", "fence"],
        label: "Code block",
        run: (editor) =>
          insertEmptyCodeBlock(editor, {
            defaultType: KEYS.p,
            insertNodesOptions: { select: true },
          }),
        value: "code-block",
      },
      {
        icon: MinusIcon,
        keywords: ["divider", "separator", "rule"],
        label: "Divider",
        run: (editor) => {
          editor.tf.setNodes({ type: KEYS.hr })
          editor.tf.focus()
        },
        value: "divider",
      },
      {
        icon: SquareSigmaIcon,
        keywords: ["math", "latex", "block"],
        label: "Equation",
        run: (editor) => insertEquation(editor, { select: true }),
        value: "equation",
      },
      {
        icon: RadicalIcon,
        keywords: ["math", "latex", "inline"],
        label: "Inline equation",
        run: (editor) => insertInlineEquation(editor, "", { select: true }),
        value: "inline-equation",
      },
    ],
  },
]

function matchesCommand(command: SlashCommand, query: string): boolean {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = [command.label, command.value, ...command.keywords]
    .join(" ")
    .toLowerCase()
  return words.every((word) => haystack.includes(word))
}

export function SlashInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const insertPointRef = useRef<PointRef | null>(null)
  const [query, setQuery] = useState("")
  const inputOwner = (element as TComboboxInputElement & { userId?: string })
    .userId
  const isCreator = !inputOwner || inputOwner === editor.meta.userId
  const cursorState = useHTMLInputCursorState(inputRef)

  useEffect(() => {
    const path = editor.api.findPath(element)
    const point = path ? editor.api.before(path) : undefined
    if (!point) return
    const pointRef = editor.api.pointRef(point)
    insertPointRef.current = pointRef
    return () => {
      if (insertPointRef.current === pointRef) insertPointRef.current = null
      pointRef.unref()
    }
  }, [editor, element])

  const { props: inputProps, removeInput } = useComboboxInput({
    autoFocus: isCreator,
    cancelInputOnBlur: true,
    cursorState,
    ref: inputRef,
    onCancelInput: (cause) => {
      if (cause !== "backspace") {
        editor.tf.insertText(`/${query}`, {
          at: insertPointRef.current?.current ?? undefined,
        })
      }
      if (cause === "arrowLeft" || cause === "arrowRight") {
        editor.tf.move({
          distance: 1,
          reverse: cause === "arrowLeft",
        })
      }
    },
  })

  const store = useComboboxStore({
    setValue: (value) => setQuery(value),
  })
  const items = store.useState("items")

  useEffect(() => {
    if (!store.getState().activeId) store.setActiveId(store.first())
  }, [items, store])

  if (!isCreator) {
    return (
      <PlateElement {...props} as="span">
        <span contentEditable={false}>/</span>
        {props.children}
      </PlateElement>
    )
  }

  const visibleGroups = COMMAND_GROUPS.map((group) => ({
    ...group,
    commands: group.commands.filter((command) => matchesCommand(command, query)),
  })).filter((group) => group.commands.length > 0)

  return (
    <PlateElement {...props} as="span">
      <span contentEditable={false} className="relative inline-flex min-w-4">
        <ComboboxProvider open store={store}>
          <span aria-hidden="true">/</span>
          <span className="relative min-h-[1lh] min-w-1">
            <span className="invisible whitespace-pre" aria-hidden="true">
              {query || "\u200B"}
            </span>
            <Combobox
              ref={inputRef}
              aria-label="Filter document commands"
              autoSelect
              className="absolute inset-0 size-full bg-transparent text-inherit outline-none"
              {...inputProps}
            />
          </span>
          <Portal>
            <ComboboxPopover
              gutter={6}
              className="z-50 max-h-72 w-72 overflow-y-auto rounded-card border border-line bg-surface p-1.5 text-ink shadow-overlay outline-none"
            >
              {visibleGroups.length === 0 && (
                <div className="px-2 py-2 text-[12px] text-ink-3">
                  No commands found
                </div>
              )}
              {visibleGroups.map((group) => (
                <ComboboxGroup
                  key={group.label}
                  className="border-b border-line py-1 last:border-b-0"
                >
                  <ComboboxGroupLabel className="px-2 py-1 text-[10px] font-medium uppercase text-ink-3">
                    {group.label}
                  </ComboboxGroupLabel>
                  {group.commands.map((command) => {
                    const Icon = command.icon
                    return (
                      <ComboboxItem
                        key={command.value}
                        value={command.value}
                        onClick={() => {
                          removeInput(true)
                          command.run(editor)
                        }}
                        className={cn(
                          "flex h-8 cursor-pointer select-none items-center gap-2 rounded-control px-2 text-[12px] outline-none transition-colors",
                          "hover:bg-hover data-[active-item=true]:bg-hover"
                        )}
                      >
                        <Icon className="size-3.5 shrink-0 text-ink-3" />
                        <span>{command.label}</span>
                      </ComboboxItem>
                    )
                  })}
                </ComboboxGroup>
              ))}
            </ComboboxPopover>
          </Portal>
        </ComboboxProvider>
      </span>
      {props.children}
    </PlateElement>
  )
}