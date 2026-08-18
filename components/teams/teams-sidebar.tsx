"use client"

import {
  ArrowLeftRightIcon,
  CheckIcon,
  CircleDashedIcon,
  InboxIcon,
  MailIcon,
  UserIcon,
} from "lucide-react"
import Link from "next/link"

import { AppSidebar } from "@/components/app-sidebar"
import {
  MEMBER_LIST,
  type Member,
  type MemberId,
} from "@/components/teams/mock-data"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type ThreadFilter = "all" | "mine" | "unassigned"

const FILTERS: { key: ThreadFilter; label: string; icon: typeof InboxIcon }[] = [
  { key: "all", label: "All shared", icon: InboxIcon },
  { key: "mine", label: "Assigned to me", icon: UserIcon },
  { key: "unassigned", label: "Unassigned", icon: CircleDashedIcon },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pt-4 pb-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
      {children}
    </p>
  )
}

export function TeamsSidebar({
  counts,
  filter,
  me,
  online,
  onFilterChange,
  onSwitchIdentity,
}: {
  counts: Record<ThreadFilter, number>
  filter: ThreadFilter
  me: Member
  online: MemberId[]
  onFilterChange: (filter: ThreadFilter) => void
  onSwitchIdentity: (id: MemberId) => void
}) {
  return (
    <AppSidebar
      active="teams"
      renderAccount={(collapsed) => (
        <WorkspaceAccount
          collapsed={collapsed}
          me={me}
          onSwitch={onSwitchIdentity}
        />
      )}
    >
      <SectionLabel>Northwind Studio</SectionLabel>
      <nav className="space-y-0.5">
        {FILTERS.map(({ key, label, icon: Icon }) => (
          <button
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
              filter === key
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
            key={key}
            onClick={() => onFilterChange(key)}
            type="button"
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 text-left">{label}</span>
            {counts[key] > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </nav>

      <SectionLabel>Team</SectionLabel>
      <div className="flex items-center gap-1 px-2.5">
        {MEMBER_LIST.map((member) => (
          <span
            className="relative"
            key={member.id}
            title={
              online.includes(member.id)
                ? `${member.name} — here now`
                : member.name
            }
          >
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-[10px] font-semibold transition-opacity",
                member.tint,
                !online.includes(member.id) && "opacity-40"
              )}
            >
              {member.initials}
            </span>
            {online.includes(member.id) && (
              <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar bg-emerald-500" />
            )}
          </span>
        ))}
      </div>

      <div className="flex-1" />
    </AppSidebar>
  )
}

/**
 * Replaces the account footer on this surface. Workspace and "acting as" both
 * live here so the top-level nav stays about personal surfaces only.
 */
function WorkspaceAccount({
  collapsed,
  me,
  onSwitch,
}: {
  collapsed: boolean
  me: Member
  onSwitch: (id: MemberId) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {collapsed ? (
          <button
            className="grid size-9 place-items-center rounded-lg transition-colors hover:bg-muted"
            title={`${me.name} · Northwind Studio`}
            type="button"
          >
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-[11px] font-semibold",
                me.tint
              )}
            >
              {me.initials}
            </span>
          </button>
        ) : (
          <button
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60"
            type="button"
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                me.tint
              )}
            >
              {me.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                {me.name}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                Northwind Studio
              </span>
            </span>
            <ArrowLeftRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-64 p-1"
        side={collapsed ? "right" : "top"}
        sideOffset={8}
      >
        <p className="px-2.5 pt-1 pb-1 text-[11px] font-medium text-muted-foreground">
          Workspaces
        </p>
        <span className="flex w-full items-center gap-2 rounded-md bg-muted px-2.5 py-2 text-[13px] font-medium">
          <span className="grid size-5 place-items-center rounded bg-foreground text-[8px] font-bold text-background">
            NW
          </span>
          <span className="flex-1">Northwind Studio</span>
          <CheckIcon className="size-3.5" />
        </span>
        <Link
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          href="/mail"
        >
          <MailIcon className="size-4" />
          Personal inbox
        </Link>

        <div className="my-1 h-px bg-border/60" />

        <p className="px-2.5 pt-1 pb-1 text-[11px] font-medium text-muted-foreground">
          Acting as
        </p>
        {MEMBER_LIST.map((member) => (
          <button
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-muted"
            key={member.id}
            onClick={() => onSwitch(member.id)}
            type="button"
          >
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full text-[9px] font-semibold",
                member.tint
              )}
            >
              {member.initials}
            </span>
            <span className="flex-1 text-left">{member.name}</span>
            {member.id === me.id && <CheckIcon className="size-3.5" />}
          </button>
        ))}
        <p className="px-2.5 pt-1.5 pb-1 text-[10px] leading-relaxed text-muted-foreground/70">
          Prototype only. Open a second window as someone else to collaborate.
        </p>
      </PopoverContent>
    </Popover>
  )
}
