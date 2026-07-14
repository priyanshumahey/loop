import Link from "next/link"

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import { LoopMark } from "@/components/loop-logo"
import { buttonVariants } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

export default async function Page() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="sky-canvas relative flex min-h-svh flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="flex flex-col items-center gap-6">
        <span className="grid size-16 place-items-center rounded-2xl bg-foreground text-background shadow-lg">
          <LoopMark className="h-9 w-[30px]" />
        </span>
        <h1 className="font-heading text-6xl font-bold tracking-tight sm:text-7xl">Loop</h1>
        <p className="max-w-xs text-muted-foreground">
          Your calendar, on autopilot.
        </p>
      </div>

      <div className="w-full max-w-xs">
        {user ? (
          <Link
            href="/home"
            className={cn(buttonVariants(), "h-11 w-full rounded-full text-sm font-medium")}
          >
            Continue to Loop
          </Link>
        ) : (
          <GoogleSignInButton />
        )}
      </div>
    </main>
  )
}
