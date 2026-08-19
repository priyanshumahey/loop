"use client"

import { useEffect, useState } from "react"

export function StreamText({
  text,
  onProgress,
  onDone,
}: {
  text: string
  onProgress?: () => void
  onDone?: () => void
}) {
  const [visibleLength, setVisibleLength] = useState(0)

  useEffect(() => {
    let nextLength = 0
    const chunkSize = Math.max(1, Math.ceil(text.length / 48))
    const timer = window.setInterval(() => {
      nextLength = Math.min(text.length, nextLength + chunkSize)
      setVisibleLength(nextLength)
      onProgress?.()

      if (nextLength === text.length) {
        window.clearInterval(timer)
        onDone?.()
      }
    }, 18)

    return () => window.clearInterval(timer)
  }, [onDone, onProgress, text])

  return <>{text.slice(0, visibleLength)}</>
}