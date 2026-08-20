"use client"

import { CalendarIcon, FileTextIcon, MailIcon, SparklesIcon } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"

type ViewKey = "chat" | "calendar" | "mail" | "documents"

const VIEWS: {
  key: ViewKey
  href: string
  label: string
  compactLabel?: string
  icon: typeof MailIcon
}[] = [
  { key: "chat", href: "/home", label: "Chat", icon: SparklesIcon },
  {
    key: "calendar",
    href: "/cal",
    label: "Calendar",
    compactLabel: "Cal",
    icon: CalendarIcon,
  },
  { key: "mail", href: "/mail", label: "Mail", icon: MailIcon },
  { key: "documents", href: "/documents", label: "Docs", icon: FileTextIcon },
]

/**
 * The shared surface switcher rendered in every sidebar so
 * navigation looks and behaves identically everywhere. The active view renders
 * as a non-interactive raised pill; the others are links.
 */
export function ViewSwitcher({
  active,
  collapsed = false,
}: {
  active: ViewKey
  collapsed?: boolean
}) {
  if (collapsed) {
    return (
      <div className="mt-1 flex flex-col items-center gap-1 rounded-xl bg-muted/70 p-1">
        {VIEWS.map(({ key, href, label, icon: Icon }) =>
          key === active ? (
            <span
              key={key}
              title={label}
              className="grid size-8 place-items-center rounded-lg bg-background text-foreground shadow-sm"
            >
              <Icon className="size-4" />
            </span>
          ) : (
            <Link
              key={key}
              href={href}
              title={label}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon className="size-4" />
            </Link>
          )
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 rounded-xl bg-muted/70 p-1">
      {VIEWS.map(({ key, href, label, compactLabel, icon: Icon }) => {
        const base =
          "flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-lg px-0.5 py-1.5 text-[12px] font-medium transition-colors"
        return key === active ? (
          <span
            key={key}
            aria-label={label}
            className={cn(base, "bg-background text-foreground shadow-sm")}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{compactLabel ?? label}</span>
          </span>
        ) : (
          <Link
            key={key}
            href={href}
            aria-label={label}
            className={cn(base, "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{compactLabel ?? label}</span>
          </Link>
        )
      })}
    </div>
  )
}
