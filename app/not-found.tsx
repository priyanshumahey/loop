import Link from "next/link"

import { LoopMark } from "@/components/loop-logo"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function NotFound() {
  return (
    <main className="sky-canvas relative flex min-h-svh flex-col items-center justify-center gap-8 px-6 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-foreground text-background shadow-lg">
        <LoopMark className="h-8 w-[26px]" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-heading text-4xl font-bold tracking-tight">Page not found</h1>
        <p className="max-w-xs text-muted-foreground">
          The page you’re looking for doesn’t exist or has moved.
        </p>
      </div>
      <Link
        href="/"
        className={cn(buttonVariants(), "h-11 rounded-full px-6 text-sm font-medium")}
      >
        Back to Loop
      </Link>
    </main>
  )
}
