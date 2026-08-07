"use client"

import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns"
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, RefreshCwIcon } from "lucide-react"

import { AgendaDaysToShow } from "@/components/event-calendar/constants"
import type { CalendarView } from "@/components/event-calendar/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CalendarHeaderProps {
  currentDate: Date
  onDateChange: (date: Date) => void
  view: CalendarView
  onViewChange: (view: CalendarView) => void
  onNewEvent: () => void
  /** Manually trigger a Google sync. */
  onRefresh?: () => void
  /** True while a background Google pull is in progress. */
  isSyncing?: boolean
  /** Whether Google Calendar is connected for the current user. */
  isConnected?: boolean
  isScheduling?: boolean
}

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
]

export function CalendarHeader({
  currentDate,
  onDateChange,
  view,
  onViewChange,
  onNewEvent,
  onRefresh,
  isSyncing,
  isConnected,
  isScheduling = false,
}: CalendarHeaderProps) {
  const handlePrevious = () => {
    if (isScheduling) {
      onDateChange(subWeeks(currentDate, 1))
    } else if (view === "month") {
      onDateChange(subMonths(currentDate, 1))
    } else if (view === "week") {
      onDateChange(subWeeks(currentDate, 1))
    } else if (view === "day") {
      onDateChange(addDays(currentDate, -1))
    } else if (view === "agenda") {
      onDateChange(addDays(currentDate, -AgendaDaysToShow))
    }
  }

  const handleNext = () => {
    if (isScheduling) {
      onDateChange(addWeeks(currentDate, 1))
    } else if (view === "month") {
      onDateChange(addMonths(currentDate, 1))
    } else if (view === "week") {
      onDateChange(addWeeks(currentDate, 1))
    } else if (view === "day") {
      onDateChange(addDays(currentDate, 1))
    } else if (view === "agenda") {
      onDateChange(addDays(currentDate, AgendaDaysToShow))
    }
  }

  const getViewTitle = () => {
    if (isScheduling) {
      const start = startOfWeek(currentDate)
      const end = endOfWeek(currentDate)
      return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`
    }
    if (view === "day") {
      return format(currentDate, "MMMM d, yyyy")
    }
    return format(currentDate, "MMMM yyyy")
  }

  return (
    <header className="flex-shrink-0 border-b border-border bg-background">
      <div className="flex items-center justify-between gap-2 px-2 py-2 sm:px-4">
        {/* Left: today, nav, title */}
        <div className="flex min-w-0 items-center gap-1 sm:gap-2 md:gap-4">
          <Button
            variant="outline"
            size="sm"
            className="ml-1 sm:ml-2"
            onClick={() => onDateChange(new Date())}
          >
            Today
          </Button>

          <div className="flex items-center">
            <Button
              aria-label="Previous"
              variant="ghost"
              size="icon-sm"
              onClick={handlePrevious}
            >
              <ChevronLeftIcon aria-hidden="true" className="size-5" />
            </Button>
            <Button
              aria-label="Next"
              variant="ghost"
              size="icon-sm"
              onClick={handleNext}
            >
              <ChevronRightIcon aria-hidden="true" className="size-5" />
            </Button>
          </div>

          <h1 className="truncate text-base font-semibold sm:text-lg md:text-xl">
            {getViewTitle()}
          </h1>
        </div>

        {/* Right: view switcher + new event */}
        <div className="flex shrink-0 items-center gap-2">
          <div
            className={cn(
              "hidden items-center rounded-lg border border-border bg-background p-0.5 sm:flex",
              isScheduling && "sm:hidden"
            )}
          >
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => onViewChange(v.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                  view === v.value
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          {isConnected === false ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = "/auth/google"
              }}
            >
              Connect Google
            </Button>
          ) : (
            onRefresh && (
              <Button
                aria-label="Sync with Google Calendar"
                variant="ghost"
                size="icon-sm"
                onClick={onRefresh}
                disabled={isSyncing}
              >
                <RefreshCwIcon
                  aria-hidden="true"
                  className={cn("size-4", isSyncing && "animate-spin")}
                />
              </Button>
            )
          )}

          {!isScheduling && (
            <Button size="sm" onClick={onNewEvent} className="gap-1.5">
              <PlusIcon aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">New event</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
