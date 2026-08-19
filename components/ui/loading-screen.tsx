import { Loader2Icon } from "lucide-react"

import { LoopMark } from "@/components/loop-logo"
import { LoadingState } from "@/components/agent"
import { cn } from "@/lib/utils"

/** A small inline spinner. */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2Icon
      className={cn("size-4 animate-spin text-muted-foreground", className)}
      aria-hidden
    />
  )
}

/**
 * Full-viewport branded loading screen. Used as the fallback for route-level
 * Suspense boundaries (`loading.tsx`) and anywhere a page-sized spinner fits.
 */
export function LoadingScreen({
  message = "Loading…",
  className,
}: {
  message?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-svh w-full flex-col items-center justify-center gap-4 bg-muted/40",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span className="relative grid size-12 place-items-center rounded-2xl bg-foreground text-background shadow-sm">
        <LoopMark className="h-6 w-[22px]" />
        <span className="absolute inset-0 animate-ping rounded-2xl bg-foreground/15" />
      </span>
      <LoadingState label={message} variant="orbit" showElapsed />
    </div>
  )
}
