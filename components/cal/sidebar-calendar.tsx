"use client"

import {
  addDays,
  addMonths,
  addYears,
  format,
  getYear,
  isSameDay,
  isSameMonth,
  isToday,
  setMonth,
  setYear,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"

type Mode = "days" | "months" | "years"

const YEARS_PER_PAGE = 12
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]
const MONTH_SAMPLES = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1))

const navButton =
  "grid size-8 place-items-center rounded-lg text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
const labelButton =
  "rounded-md px-1.5 py-0.5 text-[13px] font-medium transition-colors hover:bg-muted"

/**
 * Sidebar mini-calendar with drill-up navigation: the day grid zooms out to a
 * month picker, which zooms out to a year picker. Selecting a day reports it;
 * month/year selection only changes what the calendar is showing.
 */
export function SidebarCalendar({
  selected,
  onSelect,
  className,
}: {
  selected: Date
  onSelect: (date: Date) => void
  className?: string
}) {
  const [mode, setMode] = useState<Mode>("days")
  const [view, setView] = useState(() => startOfMonth(selected))
  const [selectedKey, setSelectedKey] = useState(selected.getTime())

  // When the selected date changes elsewhere (e.g. the main header), snap the
  // view back to it. Adjusting state during render is React's recommended
  // pattern for deriving state from props without an effect.
  if (selected.getTime() !== selectedKey) {
    setSelectedKey(selected.getTime())
    setView(startOfMonth(selected))
    setMode("days")
  }

  const step = (direction: 1 | -1) => {
    if (mode === "days") setView((v) => addMonths(v, direction))
    else if (mode === "months") setView((v) => addYears(v, direction))
    else setView((v) => addYears(v, direction * YEARS_PER_PAGE))
  }

  const today = new Date()
  const yearsPageStart = Math.floor(getYear(view) / YEARS_PER_PAGE) * YEARS_PER_PAGE
  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearsPageStart + i)
  const gridStart = startOfWeek(startOfMonth(view), { weekStartsOn: 0 })
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  return (
    <div className={cn("mx-auto w-56", className)}>
      <div className="flex items-center justify-between pb-1">
        <button type="button" onClick={() => step(-1)} className={navButton}>
          <ChevronLeftIcon className="size-4" aria-hidden />
        </button>

        <div className="flex items-center gap-0.5 text-foreground">
          {mode === "days" && (
            <>
              <button
                type="button"
                onClick={() => setMode("months")}
                className={labelButton}
              >
                {format(view, "MMMM")}
              </button>
              <button
                type="button"
                onClick={() => setMode("years")}
                className={labelButton}
              >
                {format(view, "yyyy")}
              </button>
            </>
          )}
          {mode === "months" && (
            <button
              type="button"
              onClick={() => setMode("years")}
              className={labelButton}
            >
              {format(view, "yyyy")}
            </button>
          )}
          {mode === "years" && (
            <span className="px-1.5 py-0.5 text-[13px] font-medium">
              {yearsPageStart} – {yearsPageStart + YEARS_PER_PAGE - 1}
            </span>
          )}
        </div>

        <button type="button" onClick={() => step(1)} className={navButton}>
          <ChevronRightIcon className="size-4" aria-hidden />
        </button>
      </div>

      {mode === "days" && (
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((weekday, i) => (
            <div
              key={`${weekday}-${i}`}
              className="flex size-8 items-center justify-center text-[11px] font-medium text-muted-foreground/80"
            >
              {weekday}
            </div>
          ))}
          {days.map((day) => {
            const isSelected = isSameDay(day, selected)
            const outside = !isSameMonth(day, view)
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onSelect(day)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md text-xs transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                  !isSelected && outside && "text-foreground/30",
                  !isSelected && !outside && isToday(day) && "font-semibold text-primary"
                )}
              >
                {format(day, "d")}
              </button>
            )
          })}
        </div>
      )}

      {mode === "months" && (
        <div className="grid grid-cols-3 gap-1">
          {MONTH_SAMPLES.map((month, i) => {
            const isSelected =
              getYear(view) === getYear(selected) && i === selected.getMonth()
            const isCurrent =
              getYear(view) === getYear(today) && i === today.getMonth()
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setView((v) => setMonth(v, i))
                  setMode("days")
                }}
                className={cn(
                  "flex h-9 items-center justify-center rounded-md text-xs transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                  !isSelected && isCurrent && "font-semibold text-primary"
                )}
              >
                {format(month, "MMM")}
              </button>
            )
          })}
        </div>
      )}

      {mode === "years" && (
        <div className="grid grid-cols-3 gap-1">
          {years.map((year) => {
            const isSelected = year === getYear(selected)
            const isCurrent = year === getYear(today)
            return (
              <button
                key={year}
                type="button"
                onClick={() => {
                  setView((v) => setYear(v, year))
                  setMode("months")
                }}
                className={cn(
                  "flex h-9 items-center justify-center rounded-md text-xs tabular-nums transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                  !isSelected && isCurrent && "font-semibold text-primary"
                )}
              >
                {year}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
