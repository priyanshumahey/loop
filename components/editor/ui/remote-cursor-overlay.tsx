"use client"

import {
  useRemoteCursorOverlayPositions,
  type CursorOverlayData,
} from "@slate-yjs/react"
import { useRef, type RefObject } from "react"

interface CursorData {
  [key: string]: unknown
  color: string
  name: string
}

function RemoteCursor({
  caretPosition,
  data,
  selectionRects,
  clientId,
}: Pick<
  CursorOverlayData<CursorData>,
  "caretPosition" | "data" | "selectionRects" | "clientId"
>) {
  const fallbackColor = `hsl(${(Math.abs(clientId) * 137) % 360} 65% 50%)`
  const color = data?.color ?? fallbackColor
  const name = data?.name ?? "Collaborator"

  return (
    <>
      {selectionRects.map((rect, index) => (
        <span
          key={index}
          className="pointer-events-none absolute rounded-[2px] opacity-20"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            backgroundColor: color,
          }}
        />
      ))}
      {caretPosition && (
        <span
          className="pointer-events-none absolute w-0.5 rounded-full"
          style={{
            left: caretPosition.left,
            top: caretPosition.top,
            height: caretPosition.height,
            backgroundColor: color,
          }}
        >
          <span
            className="absolute bottom-full left-0 mb-0.5 whitespace-nowrap rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white shadow-sm"
            style={{ backgroundColor: color }}
          >
            {name}
          </span>
        </span>
      )}
    </>
  )
}

export function RemoteCursorOverlay() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cursors] = useRemoteCursorOverlayPositions<CursorData>({
    containerRef: containerRef as RefObject<HTMLDivElement>,
  })

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-20"
    >
      {cursors.map((cursor) => (
        <RemoteCursor key={cursor.clientId} {...cursor} />
      ))}
    </div>
  )
}
