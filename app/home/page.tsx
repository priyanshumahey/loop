import { redirect } from "next/navigation"

import { LogoutButton } from "@/components/auth/logout-button"
import { createClient } from "@/lib/supabase/server"

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/")

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-heading text-4xl font-bold tracking-tight">Welcome!</h1>
      <LogoutButton />
    </main>
  )
}
