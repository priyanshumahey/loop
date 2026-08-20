"use client"

import { isOrderedList } from "@platejs/list"
import {
  useTodoListElement,
  useTodoListElementState,
} from "@platejs/list/react"
import { CheckIcon } from "lucide-react"
import type { TListElement } from "platejs"
import type {
  PlateElementProps,
  RenderNodeWrapper,
} from "platejs/react"
import { useReadOnly } from "platejs/react"

import { cn } from "@/lib/utils"

export const BlockList: RenderNodeWrapper = (initialProps) => {
  if (!initialProps.element.listStyleType) return
  if (!isOrderedList(initialProps.element)) return

  return function BlockListWrapper(props) {
    return <ListElement {...props} />
  }
}

function ListElement(props: PlateElementProps) {
  const { listStart, listStyleType } = props.element as TListElement
  const ordered = isOrderedList(props.element)
  const todo = listStyleType === "todo"
  const List = ordered ? "ol" : "ul"

  return (
    <List
      className={cn(
        "relative my-0 pl-6",
        todo && "list-none pl-6"
      )}
      style={{ listStyleType: todo ? "none" : listStyleType }}
      start={listStart}
    >
      {todo && <TodoMarker {...props} />}
      <li
        className={cn(
          todo && "list-none",
          todo && Boolean(props.element.checked) &&
            "text-muted-foreground line-through"
        )}
      >
        {props.children}
      </li>
    </List>
  )
}

function TodoMarker(props: PlateElementProps) {
  const state = useTodoListElementState({ element: props.element })
  const { checkboxProps } = useTodoListElement(state)
  const readOnly = useReadOnly()

  return (
    <span contentEditable={false}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checkboxProps.checked}
        disabled={readOnly}
        onMouseDown={checkboxProps.onMouseDown}
        onClick={() => checkboxProps.onCheckedChange(!checkboxProps.checked)}
        className={cn(
          "absolute -left-0.5 top-[0.42em] grid size-4 place-items-center rounded-[4px] border border-line-strong bg-surface text-canvas transition-colors",
          checkboxProps.checked && "border-ink bg-ink",
          readOnly && "pointer-events-none"
        )}
      >
        {checkboxProps.checked && <CheckIcon className="size-3" />}
      </button>
    </span>
  )
}
