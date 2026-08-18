"use client"

// Adapted from Plate UI / slate-yjs (MIT). Renders remote collaborators' text
// selections and name flags over the editor surface.

import { YjsPlugin } from "@platejs/yjs/react"
import {
  useRemoteCursorOverlayPositions,
  type CursorOverlayData,
} from "@slate-yjs/react"
import { useEditorContainerRef, usePluginOption } from "platejs/react"
import { useState, type CSSProperties } from "react"

interface CursorData extends Record<string, unknown> {
  color: string
  name: string
}

export function RemoteCursorOverlay() {
  const isSynced = usePluginOption(YjsPlugin, "_isSynced")
  if (!isSynced) return null
  return <OverlayContent />
}

function OverlayContent() {
  const containerRef = useEditorContainerRef()
  const [cursors] = useRemoteCursorOverlayPositions<CursorData>({
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
  })

  return (
    <>
      {cursors.map((cursor) => (
        <RemoteSelection key={cursor.clientId} {...cursor} />
      ))}
    </>
  )
}

function RemoteSelection({
  caretPosition,
  data,
  selectionRects,
}: CursorOverlayData<CursorData>) {
  if (!data) return null

  return (
    <>
      {selectionRects.map((position, i) => (
        <div
          className="pointer-events-none absolute rounded-[1px]"
          key={i}
          style={{ ...position, backgroundColor: withAlpha(data.color, 0.28) }}
        />
      ))}
      {caretPosition && <Caret caretPosition={caretPosition} data={data} />}
    </>
  )
}

function Caret({
  caretPosition,
  data,
}: Pick<CursorOverlayData<CursorData>, "caretPosition" | "data">) {
  const [hovered, setHovered] = useState(false)

  const caretStyle: CSSProperties = {
    ...caretPosition,
    background: data?.color,
    transition: "opacity 150ms",
    opacity: hovered ? 1 : 0.85,
  }

  const labelStyle: CSSProperties = {
    background: data?.color,
    transform: "translateY(-100%)",
    transition: "opacity 150ms",
    opacity: hovered ? 1 : 0.85,
  }

  return (
    <div className="absolute w-0.5" style={caretStyle}>
      <div
        className="absolute top-0 -left-px whitespace-nowrap rounded-sm rounded-bl-none px-1.5 py-0.5 text-[10px] font-medium text-white"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={labelStyle}
      >
        {data?.name}
      </div>
    </div>
  )
}

/** Append an alpha channel to a `#rrggbb` colour. */
function withAlpha(hex: string, opacity: number): string {
  const alpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255)
  return hex + alpha.toString(16).padStart(2, "0")
}
