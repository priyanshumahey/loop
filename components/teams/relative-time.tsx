"use client"

import { format, formatDistanceToNow } from "date-fns"
import { useEffect, useState } from "react"

/**
 * Relative timestamps are measured against "now", which is a different instant
 * on the server than at hydration — so rendering one directly is a hydration
 * mismatch waiting to happen. Render the absolute date first (identical in both
 * passes) and swap to the relative form once mounted.
 */
export function RelativeTime({
  addSuffix = true,
  value,
}: {
  addSuffix?: boolean
  value: string
}) {
  const [relative, setRelative] = useState<string | null>(null)

  useEffect(() => {
    const date = new Date(value)
    const update = () =>
      setRelative(formatDistanceToNow(date, { addSuffix }))

    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [addSuffix, value])

  return <>{relative ?? format(new Date(value), "MMM d")}</>
}
