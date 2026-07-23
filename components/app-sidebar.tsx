"use client"

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react"
import type { ReactNode } from "react"

import { LoopMark } from "@/components/loop-logo"
import { UserAccount } from "@/components/user-account"
import { ViewSwitcher } from "@/components/view-switcher"
import { usePersistentState } from "@/hooks/use-persistent-state"

type SurfaceKey = "chat" | "calendar" | "mail"

/**
 * A single shared collapse key (rather than one per surface) so the sidebar's
 * expanded/collapsed state is preserved as you move between Chat, Calendar and
 * Mail — the chrome behaves like one persistent sidebar across every page.
 */
const COLLAPSE_KEY = "loop:sidebar:collapsed"

/**
 * The shared sidebar shell used by every surface. It owns the chrome that is
 * identical everywhere — the brand header, collapse toggle, view switcher and
 * account footer (plus the collapsed rail) — and renders each surface's own
 * body via `children`. Surfaces only supply what's unique to them.
 */
export function AppSidebar({
  active,
  children,
  railAction,
}: {
  active: SurfaceKey
  /** Surface-specific body rendered between the switcher and the account footer. */
  children: ReactNode
  /** Optional primary action shown on the collapsed rail (e.g. New event). */
  railAction?: ReactNode
}) {
  const [collapsed, setCollapsed] = usePersistentState(COLLAPSE_KEY, false)

  if (collapsed) {
    return (
      <div className="flex h-svh w-14 shrink-0 flex-col items-center gap-2 px-2 py-3">
        <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
          <LoopMark className="h-4 w-[13px]" />
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpenIcon className="size-4" />
        </button>

        <ViewSwitcher active={active} collapsed />

        {railAction}

        <div className="mt-auto border-t border-border/60 pt-2">
          <UserAccount collapsed />
        </div>
      </div>
    )
  }

  return (
    <aside className="flex h-svh w-[264px] shrink-0 flex-col gap-1 px-3 py-3 text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
            <LoopMark className="h-4 w-[13px]" />
          </span>
          <span className="font-heading text-[15px] font-semibold tracking-tight">
            Loop
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeftCloseIcon className="size-4" />
        </button>
      </div>

      <ViewSwitcher active={active} />

      {children}

      {/* Account */}
      <div className="mt-1 border-t border-border/60 pt-1">
        <UserAccount />
      </div>
    </aside>
  )
}
