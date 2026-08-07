"use client"

import { format, isSameDay } from "date-fns"
import {
  CalendarClockIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  PlusIcon,
} from "lucide-react"
import { useMemo } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { CalendarShareDialog } from "@/components/cal/calendar-share-dialog"
import type { CalendarEvent, EventColor } from "@/components/event-calendar/types"
import { SidebarCalendar } from "@/components/cal/sidebar-calendar"
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
  currentDate,
  todayEvents,
  recentEvents,
  onDateChange,
  onNewEvent,
  mode,
  onSchedule,
  onOpenEvent,
}: {
  currentDate: Date
  todayEvents: CalendarEvent[]
  recentEvents: CalendarEvent[]
  onDateChange: (date: Date) => void
  onNewEvent: () => void
  mode: "calendar" | "schedule"
  onSchedule: () => void
  onOpenEvent: (event: CalendarEvent) => void
}) {
  const sortedToday = useMemo(
    () =>
      [...todayEvents].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      ),
    [todayEvents]
  )

  return (
    <AppSidebar
      active="calendar"
      railAction={
        <div className="mt-1 flex flex-col gap-1">
          <button
            type="button"
            onClick={onNewEvent}
            title="New event"
            className="grid size-9 place-items-center rounded-lg border border-border/70 bg-background text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <PlusIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={onSchedule}
            title={mode === "schedule" ? "Back to calendar" : "Schedule"}
            className={cn(
              "grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              mode === "schedule" &&
                "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
            )}
          >
            <CalendarClockIcon className="size-4" />
          </button>
          <CalendarShareDialog triggerVariant="rail" />
        </div>
      }
    >
      {/* New event */}
      <button
        type="button"
        onClick={onNewEvent}
        className="mt-1 flex w-full items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60"
      >
        <PlusIcon className="size-4" />
        New event
      </button>

      <button
        type="button"
        onClick={onSchedule}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
          mode === "schedule"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <CalendarClockIcon className="size-4" />
        {mode === "schedule" ? "Calendar" : "Schedule"}
      </button>

      <CalendarShareDialog />

      <SidebarCalendar
        selected={currentDate}
        onSelect={onDateChange}
        className="mt-2"
      />

      {/* Sections */}
      <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto border-t border-border/60 px-1 pt-2">
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
    </AppSidebar>
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
