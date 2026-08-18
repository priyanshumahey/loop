"use client"

import { LogOutIcon, UsersIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface AccountUser {
  name: string
  email: string
  avatarUrl: string | null
}

function initialsFrom(name: string, email: string): string {
  const source = name.trim() || email.trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export function UserAccount({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter()
  const [user, setUser] = useState<AccountUser | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true

    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return
      const meta = data.user.user_metadata ?? {}
      setUser({
        name: meta.full_name ?? meta.name ?? "",
        email: data.user.email ?? "",
        avatarUrl: meta.avatar_url ?? meta.picture ?? null,
      })
    })

    return () => {
      active = false
    }
  }, [])

  const signOut = async () => {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  if (!user) return null

  const displayName = user.name || user.email
  const initials = initialsFrom(user.name, user.email)

  const avatar = (
    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground text-[11px] font-medium text-background">
      {user.avatarUrl ? (
        <Image
          src={user.avatarUrl}
          alt={displayName}
          width={32}
          height={32}
          className="size-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        {collapsed ? (
          <button
            type="button"
            title={displayName}
            className="grid size-9 place-items-center rounded-lg transition-colors hover:bg-muted/60"
          >
            {avatar}
          </button>
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60"
          >
            {avatar}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">
                {displayName}
              </span>
              {user.email && user.name ? (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {user.email}
                </span>
              ) : null}
            </span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={collapsed ? "start" : "end"}
        side="top"
        sideOffset={8}
        className="w-56 p-1"
      >
        <p className="px-2.5 pt-1 pb-1 text-[11px] font-medium text-muted-foreground">
          Workspaces
        </p>
        <Link
          href="/teams"
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          <UsersIcon className="size-4" />
          Northwind Studio
        </Link>
        <div className="my-1 h-px bg-border/60" />
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted",
            signingOut && "opacity-60"
          )}
        >
          <LogOutIcon className="size-4" />
          {signingOut ? "Logging out…" : "Log out"}
        </button>
      </PopoverContent>
    </Popover>
  )
}
