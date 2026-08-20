"use client"

import { ResizeHandle } from "@platejs/resizable"
import {
  TableProvider,
  useTableCellElement,
  useTableCellElementResizable,
  useTableColSizes,
  useTableElement,
  useTableSelectionDom,
} from "@platejs/table/react"
import type {
  TTableCellElement,
  TTableElement,
  TTableRowElement,
} from "platejs"
import {
  PlateElement,
  type PlateElementProps,
  useReadOnly,
  withHOC,
} from "platejs/react"
import { useRef } from "react"

import { cn } from "@/lib/utils"

export const TableElement = withHOC(
  TableProvider,
  function TableElement({
    children,
    ...props
  }: PlateElementProps<TTableElement>) {
    const { marginLeft, props: tableProps } = useTableElement()
    const colSizes = useTableColSizes()
    const tableRef = useRef<HTMLTableElement>(null)
    useTableSelectionDom(tableRef)

    return (
      <PlateElement
        {...props}
        className="overflow-x-auto py-4"
        style={{ paddingLeft: marginLeft }}
      >
        <table
          ref={tableRef}
          className="table-fixed border-collapse text-left"
          style={{
            width: colSizes.length
              ? Math.max(
                  240,
                  colSizes.reduce((total, size) => total + (size || 120), 0)
                )
              : "100%",
          }}
          {...tableProps}
        >
          {colSizes.length > 0 && (
            <colgroup>
              {colSizes.map((size, index) => (
                <col key={index} style={{ width: size || 120 }} />
              ))}
            </colgroup>
          )}
          <tbody>{children}</tbody>
        </table>
      </PlateElement>
    )
  }
)

export function TableRowElement({
  children,
  ...props
}: PlateElementProps<TTableRowElement>) {
  return (
    <PlateElement {...props} as="tr">
      {children}
    </PlateElement>
  )
}

export function TableCellElement({
  isHeader = false,
  ...props
}: PlateElementProps<TTableCellElement> & { isHeader?: boolean }) {
  const readOnly = useReadOnly()
  const {
    colIndex,
    colSpan,
    minHeight,
    rowIndex,
    rowSpan,
    selected,
    width,
  } = useTableCellElement()
  const { bottomProps, hiddenLeft, leftProps, rightProps } =
    useTableCellElementResizable({ colIndex, colSpan, rowIndex })

  return (
    <PlateElement
      {...props}
      as={isHeader ? "th" : "td"}
      attributes={{
        ...props.attributes,
        colSpan,
        rowSpan,
      }}
      className={cn(
        "relative border border-line bg-white p-0 align-top dark:bg-card",
        isHeader && "bg-field font-semibold dark:bg-field",
        selected && "z-10 bg-accent-tint ring-2 ring-inset ring-accent/40"
      )}
      style={{
        backgroundColor: props.element.background as string | undefined,
        minWidth: width,
        width,
      }}
    >
      <div
        className="relative z-10 box-border h-full min-w-0 px-3 py-2"
        style={{ minHeight }}
      >
        {props.children}
      </div>
      {!readOnly && (
        <>
          {!hiddenLeft && (
            <ResizeHandle
              {...leftProps}
              contentEditable={false}
              className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none"
            />
          )}
          <ResizeHandle
            {...rightProps}
            contentEditable={false}
            className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none"
          />
          <ResizeHandle
            {...bottomProps}
            contentEditable={false}
            className="absolute inset-x-0 -bottom-1 z-20 h-2 cursor-row-resize touch-none"
          />
        </>
      )}
    </PlateElement>
  )
}

export function TableCellHeaderElement(
  props: PlateElementProps<TTableCellElement>
) {
  return <TableCellElement {...props} isHeader />
}