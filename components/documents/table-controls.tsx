"use client"

import { TablePlugin, useTableMergeState } from "@platejs/table/react"
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CombineIcon,
  Table2Icon,
  TableCellsSplitIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { KEYS } from "platejs"
import { useEditorPlugin, useEditorSelector } from "platejs/react"
import { useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ToolbarButton } from "@/components/ui/toolbar"

export function TableControls() {
  const [open, setOpen] = useState(false)
  const inTable = useEditorSelector(
    (editor) => editor.api.some({ match: { type: KEYS.table } }),
    []
  )
  const { editor, tf } = useEditorPlugin(TablePlugin)
  const { canMerge, canSplit } = useTableMergeState()

  const run = (action: () => void) => {
    action()
    setOpen(false)
    editor.tf.focus()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolbarButton
          pressed={open}
          aria-label="Table"
          tooltip="Table"
          isDropdown
        >
          <Table2Icon />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 rounded-card p-1.5">
        <MenuLabel>Insert table</MenuLabel>
        <div>
          {[2, 3, 4].map((size) => (
            <MenuButton
              key={size}
              icon={Table2Icon}
              label={`${size} x ${size}`}
              onClick={() =>
                run(() =>
                  tf.insert.table(
                    { colCount: size, header: true, rowCount: size },
                    { select: true }
                  )
                )
              }
            />
          ))}
        </div>
        <div className="my-1 h-px bg-line" />
        <MenuLabel>Rows and columns</MenuLabel>
        <div>
          <MenuButton
            icon={ArrowUpIcon}
            label="Insert row above"
            disabled={!inTable}
            onClick={() => run(() => tf.insert.tableRow({ before: true }))}
          />
          <MenuButton
            icon={ArrowDownIcon}
            label="Insert row below"
            disabled={!inTable}
            onClick={() => run(() => tf.insert.tableRow())}
          />
          <MenuButton
            icon={ArrowLeftIcon}
            label="Insert column before"
            disabled={!inTable}
            onClick={() => run(() => tf.insert.tableColumn({ before: true }))}
          />
          <MenuButton
            icon={ArrowRightIcon}
            label="Insert column after"
            disabled={!inTable}
            onClick={() => run(() => tf.insert.tableColumn())}
          />
          <MenuButton
            icon={XIcon}
            label="Delete row"
            disabled={!inTable}
            onClick={() => run(() => tf.remove.tableRow())}
          />
          <MenuButton
            icon={XIcon}
            label="Delete column"
            disabled={!inTable}
            onClick={() => run(() => tf.remove.tableColumn())}
          />
        </div>
        <div className="my-1 h-px bg-line" />
        <div>
          <MenuButton
            icon={CombineIcon}
            label="Merge cells"
            disabled={!canMerge}
            onClick={() => run(() => tf.table.merge())}
          />
          <MenuButton
            icon={TableCellsSplitIcon}
            label="Split cell"
            disabled={!canSplit}
            onClick={() => run(() => tf.table.split())}
          />
          <MenuButton
            icon={Trash2Icon}
            label="Delete table"
            disabled={!inTable}
            destructive
            onClick={() => run(() => tf.remove.table())}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1 text-[10px] font-medium uppercase text-ink-3">
      {children}
    </div>
  )
}

function MenuButton({
  destructive = false,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: {
  destructive?: boolean
  disabled?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        destructive
          ? "flex h-8 w-full items-center gap-2 rounded-control px-2 text-left text-[12px] text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-40"
          : "flex h-8 w-full items-center gap-2 rounded-control px-2 text-left text-[12px] text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
      }
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  )
}