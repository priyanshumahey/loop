"use client"

import { useEquationElement, useEquationInput } from "@platejs/math/react"
import { CornerDownLeftIcon, RadicalIcon } from "lucide-react"
import type { TEquationElement } from "platejs"
import {
  createPrimitiveComponent,
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useElement,
  useReadOnly,
  useSelected,
  type PlateElementProps,
} from "platejs/react"
import { useRef, useState } from "react"
import TextareaAutosize, {
  type TextareaAutosizeProps,
} from "react-textarea-autosize"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import "katex/dist/katex.min.css"

const katexOptions = {
  displayMode: true,
  errorColor: "#cc0000",
  fleqn: false,
  leqno: false,
  macros: { "\\f": "#1f(#2)" },
  output: "htmlAndMathml" as const,
  strict: "warn" as const,
  throwOnError: false,
  trust: false,
}

export function EquationElement(props: PlateElementProps<TEquationElement>) {
  const selected = useSelected()
  const [open, setOpen] = useState(selected)
  const katexRef = useRef<HTMLDivElement | null>(null)

  useEquationElement({ element: props.element, katexRef, options: katexOptions })

  return (
    <PlateElement className="my-2" {...props}>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <div
            className={cn(
              "group flex cursor-pointer select-none items-center justify-center rounded-control transition-colors hover:bg-accent-tint",
              props.element.texExpression.length === 0
                ? "bg-field p-3"
                : "px-2 py-1",
              selected && "bg-accent-tint"
            )}
            data-selected={selected}
            contentEditable={false}
            role="button"
            tabIndex={0}
          >
            {props.element.texExpression ? (
              <span ref={katexRef} />
            ) : (
              <span className="flex h-7 w-full items-center gap-2 text-[13px] text-ink-3">
                <RadicalIcon className="size-5" /> Add a TeX equation
              </span>
            )}
          </div>
        </PopoverTrigger>
        <EquationPopoverContent
          open={open}
          setOpen={setOpen}
          isInline={false}
          placeholder={"f(x) = \\begin{cases}\n x^2, & x > 0 \\\\ \n 0, & x = 0\n\\end{cases}"}
        />
      </Popover>
      {props.children}
    </PlateElement>
  )
}

export function InlineEquationElement(
  props: PlateElementProps<TEquationElement>
) {
  const selected = useSelected()
  const collapsed = useEditorSelector((editor) => editor.api.isCollapsed(), [])
  const [open, setOpen] = useState(selected && collapsed)
  const katexRef = useRef<HTMLDivElement | null>(null)

  useEquationElement({ element: props.element, katexRef, options: katexOptions })

  return (
    <PlateElement
      {...props}
      className="mx-1 inline-block select-none rounded-control [&_.katex-display]:my-0!"
    >
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <span
            className={cn(
              "relative inline-flex min-h-6 cursor-pointer items-center px-1",
              (selected || open) && "bg-accent-tint",
              !props.element.texExpression && "text-ink-3"
            )}
            contentEditable={false}
            role="button"
            tabIndex={0}
          >
            <span ref={katexRef} className={cn(!props.element.texExpression && "hidden")} />
            {!props.element.texExpression && (
              <span className="inline-flex items-center gap-1">
                <RadicalIcon className="size-3.5" /> New equation
              </span>
            )}
          </span>
        </PopoverTrigger>
        <EquationPopoverContent
          open={open}
          setOpen={setOpen}
          isInline
          placeholder="E = mc^2"
        />
      </Popover>
      {props.children}
    </PlateElement>
  )
}

const EquationInput = createPrimitiveComponent(TextareaAutosize)({
  propsHook: useEquationInput,
})

function EquationPopoverContent({
  className,
  isInline,
  open,
  setOpen,
  ...props
}: {
  isInline: boolean
  open: boolean
  setOpen: (open: boolean) => void
} & TextareaAutosizeProps) {
  const editor = useEditorRef()
  const readOnly = useReadOnly()
  const element = useElement<TEquationElement>()

  if (readOnly) return null

  const close = () => {
    setOpen(false)
    if (isInline) editor.tf.select(element, { focus: true, next: true })
  }

  return (
    <PopoverContent
      className={cn("w-80 rounded-card p-3", isInline && "w-64")}
      onEscapeKeyDown={(event) => event.preventDefault()}
      contentEditable={false}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[12px] font-medium text-ink-3">
          <RadicalIcon className="size-3.5" />
          {isInline ? "Inline equation" : "Block equation"}
        </div>
        <EquationInput
          className={cn(
            "max-h-[50vh] min-h-16 w-full resize-none rounded-control border border-line bg-field p-2 font-mono text-[12px] text-ink outline-none focus:border-line-strong",
            isInline && "min-h-10",
            className
          )}
          state={{ isInline, open, onClose: close }}
          autoFocus
          {...props}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={close}>
            Done <CornerDownLeftIcon className="size-3" />
          </Button>
        </div>
      </div>
    </PopoverContent>
  )
}