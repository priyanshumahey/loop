"use client"

import {
  computeDiff,
  type DiffOperation,
  withGetFragmentExcludeDiff,
} from "@platejs/diff"
import { createSlatePlugin, KEYS, type TElement, type Value } from "platejs"
import {
  createPlateEditor,
  Plate,
  PlateLeaf,
  toPlatePlugin,
  type PlateElementProps,
  type PlateLeafProps,
  usePlateEditor,
} from "platejs/react"
import { useMemo, useState } from "react"

import { createDocumentEditorKit } from "@/components/documents/document-editor-kit"
import { Editor, EditorContainer } from "@/components/ui/editor"
import { cn } from "@/lib/utils"

const operationClass: Record<DiffOperation["type"], string> = {
  delete: "bg-destructive/12 text-destructive line-through decoration-destructive/70",
  insert: "bg-green/12 text-green",
  update: "bg-accent-tint text-accent-ink",
}

const operationLabel: Record<DiffOperation["type"], string> = {
  delete: "Removed",
  insert: "Added",
  update: "Changed",
}

const TABLE_STRUCTURE_TYPES = new Set<string>([KEYS.tr, KEYS.td, KEYS.th])

function DiffLeaf({ children, ...props }: PlateLeafProps) {
  const operation = props.leaf.diffOperation as DiffOperation
  const element =
    operation.type === "delete"
      ? "del"
      : operation.type === "insert"
        ? "ins"
        : "span"

  return (
    <PlateLeaf
      {...props}
      as={element}
      className={cn("rounded-[2px] px-0.5", operationClass[operation.type])}
      attributes={{
        ...props.attributes,
        "aria-label": operationLabel[operation.type],
      }}
    >
      {children}
    </PlateLeaf>
  )
}

const DiffPlugin = toPlatePlugin(
  createSlatePlugin({
    key: "diff",
    node: { isLeaf: true },
  }).overrideEditor(withGetFragmentExcludeDiff),
  {
    render: {
      node: DiffLeaf,
      aboveNodes:
        () =>
        ({ children, element }: PlateElementProps<TElement>) => {
          if (!element.diff) return children
          if (TABLE_STRUCTURE_TYPES.has(element.type)) {
            return children
          }
          const operation = element.diffOperation as DiffOperation
          return (
            <div
              aria-label={operationLabel[operation.type]}
              className={cn(
                "my-1 rounded-[3px] px-1",
                operationClass[operation.type]
              )}
            >
              {children}
            </div>
          )
        },
    },
  }
)

function cloneValue(value: Value): Value {
  return structuredClone(value)
}

export function DocumentRevisionDiff({
  current,
  previous,
}: {
  current: Value
  previous: Value
}) {
  const [plugins] = useState(() => [
    ...createDocumentEditorKit(() => false),
    DiffPlugin,
  ])
  const [comparisonEditor] = useState(() => createPlateEditor({ plugins }))
  const diffValue = useMemo(
    () =>
      computeDiff(cloneValue(previous), cloneValue(current), {
        ignoreProps: ["id"],
        isInline: comparisonEditor.api.isInline,
        lineBreakChar: "¶",
      }) as Value,
    [comparisonEditor, current, previous]
  )
  const editor = usePlateEditor(
    {
      plugins,
      readOnly: true,
      value: diffValue,
    },
    [diffValue]
  )

  return (
    <Plate editor={editor} readOnly>
      <EditorContainer className="h-auto! overflow-visible! bg-white dark:bg-card">
        <Editor
          variant="none"
          readOnly
          className="min-h-48 px-5 py-4 text-[13px] leading-[1.65] text-[#1d1d1f] dark:text-foreground"
        />
      </EditorContainer>
    </Plate>
  )
}