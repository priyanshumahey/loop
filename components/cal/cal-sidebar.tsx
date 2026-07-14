"use client"

import { format, isSameDay } from "date-fns"
import {
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import type { CalendarEvent, EventColor } from "@/components/event-calendar/types"
import { LoopMark } from "@/components/loop-logo"
import { UserAccount } from "@/components/user-account"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { cn } from "@/lib/utils"

const COLOR_DOT: Record<EventColor, string> = {
  sky: "bg-sky-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
  rose: "bg-rose-400",
  emerald: "bg-emerald-400",
  orange: "bg-orange-400",
}

function EventRow({
  event,
  onOpen,
}: {
  event: CalendarEvent
  onOpen: (event: CalendarEvent) => void
}) {
  const time = event.allDay ? "All day" : format(new Date(event.start), "h:mm a")
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          COLOR_DOT[event.color ?? "sky"]
        )}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
        {event.title || "Untitled"}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {time}
      </span>
    </button>
  )
}

function Section({
  icon,
  label,
  count,
  defaultOpen = true,
  children,
}: {
  icon: React.ReactNode
  label: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  // Persist each section's open/closed state per label, across navigations.
  const [open, setOpen] = usePersistentState(
    `loop:cal:section:${label}`,
    defaultOpen
  )
  return (
    <div className="flex min-h-0 flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRightIcon
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
        {icon}
        <span className="text-[12px] font-medium">{label}</span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/70">
          {count}
        </span>
      </button>
      {open && <div className="mt-0.5 flex flex-col gap-0.5 pb-1">{children}</div>}
    </div>
  )
}

export function CalSidebar({
  todayEvents,
  recentEvents,
  onNewEvent,
  onOpenEvent,
}: {
  todayEvents: CalendarEvent[]
  recentEvents: CalendarEvent[]
  onNewEvent: () => void
  onOpenEvent: (event: CalendarEvent) => void
}) {
  const sortedToday = useMemo(
    () =>
      [...todayEvents].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      ),
    [todayEvents]
  )

  const [collapsed, setCollapsed] = usePersistentState(
    "loop:cal:sidebar-collapsed",
    false
  )

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

        {/* View switcher */}
        <div className="mt-1 flex flex-col items-center gap-1 rounded-xl bg-muted/70 p-1">
          <Link
            href="/home"
            title="Chat"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <SparklesIcon className="size-4" />
          </Link>
          <span
            title="Calendar"
            className="grid size-8 place-items-center rounded-lg bg-background text-foreground shadow-sm"
          >
            <CalendarIcon className="size-4" />
          </span>
        </div>

        <button
          type="button"
          onClick={onNewEvent}
          title="New event"
          className="mt-1 grid size-9 place-items-center rounded-lg border border-border/70 bg-background text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <PlusIcon className="size-4" />
        </button>

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
          <span className="font-heading text-[15px] font-semibold tracking-tight">Loop</span>
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

      {/* View switcher */}
      <div className="flex items-center gap-1 rounded-xl bg-muted/70 p-1">
        <Link
          href="/home"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <SparklesIcon className="size-3.5" />
          Chat
        </Link>
        <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-background px-2.5 py-1.5 text-[13px] font-medium text-foreground shadow-sm">
          <CalendarIcon className="size-3.5" />
          Calendar
        </span>
      </div>

      {/* New event */}
      <button
        type="button"
        onClick={onNewEvent}
        className="mt-1 flex w-full items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60"
      >
        <PlusIcon className="size-4" />
        New event
      </button>

      {/* Sections */}
      <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1">
        <Section
          icon={<ClockIcon className="size-3.5" />}
          label="Recently opened"
          count={recentEvents.length}
        >
          {recentEvents.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-muted-foreground">
              No recent events
            </p>
          ) : (
            recentEvents.map((event) => (
              <EventRow key={event.id} event={event} onOpen={onOpenEvent} />
            ))
          )}
        </Section>

        <Section
          icon={<CalendarIcon className="size-3.5" />}
          label="Today"
          count={sortedToday.length}
        >
          {sortedToday.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-muted-foreground">
              Nothing scheduled today
            </p>
          ) : (
            sortedToday.map((event) => (
              <EventRow key={event.id} event={event} onOpen={onOpenEvent} />
            ))
          )}
        </Section>
      </div>

      {/* Account */}
      <div className="mt-1 border-t border-border/60 pt-1">
        <UserAccount />
      </div>
    </aside>
  )
}

/** Returns the events that occur on the given day. */
export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter(
    (event) =>
      isSameDay(new Date(event.start), day) ||
      isSameDay(new Date(event.end), day) ||
      (new Date(event.start) <= day && new Date(event.end) >= day)
  )
}
