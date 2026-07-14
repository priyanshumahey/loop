"use client"

import { useEffect } from "react"

import { LoopMark } from "@/components/loop-logo"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="sky-canvas relative flex min-h-svh flex-col items-center justify-center gap-8 px-6 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-foreground text-background shadow-lg">
        <LoopMark className="h-8 w-[26px]" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-heading text-4xl font-bold tracking-tight">
          Something went wrong
        </h1>
        <p className="max-w-xs text-muted-foreground">
          An unexpected error occurred. Try again, and if it keeps happening, reload the page.
        </p>
      </div>
      <Button onClick={reset} className="h-11 rounded-full px-6 text-sm font-medium">
        Try again
      </Button>
    </main>
  )
}
