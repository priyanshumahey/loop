import { redirect } from "next/navigation"

import { ChatHome } from "@/components/chat/chat-home"
import { createClient } from "@/lib/supabase/server"

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/")

  return <ChatHome />
}
