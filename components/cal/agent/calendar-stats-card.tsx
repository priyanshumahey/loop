"use client"

import { format } from "date-fns"
import { ClockIcon, TrendingUpIcon } from "lucide-react"

import { ConnectGoogle } from "@/components/cal/agent/connect-google"
import type { CalendarStats } from "@/lib/cal-agent/tools"
import { cn } from "@/lib/utils"

/**
 * Generative-UI block for the `calendarStats` tool: total meeting hours, count,
 * busiest day, and a per-day bar breakdown.
 */
export function CalendarStatsCard({
  stats,
  connected,
  error,
}: {
  stats?: CalendarStats
  connected: boolean
  error?: string
}) {
  if (error && !connected) return <ConnectGoogle />
  if (error) {
    return (
      <div className="my-2 text-[12px] text-destructive">
        Couldn&apos;t compute stats: {error}
      </div>
    )
  }
  if (!stats) return null

  if (stats.totalEvents === 0 && !connected) return <ConnectGoogle />

  const rangeLabel = `${format(new Date(stats.rangeStart), "MMM d")} – ${format(
    new Date(stats.rangeEnd),
    "MMM d"
  )}`
  const maxHours = Math.max(1, ...stats.byDay.map((d) => d.hours))

  return (
    <div className="my-2 flex flex-col gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Meeting load
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground/80">
          {rangeLabel}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <Metric
          icon={<ClockIcon className="size-3.5" />}
          value={`${stats.totalHours}h`}
          label="in meetings"
        />
        <Metric
          value={String(stats.meetingCount)}
          label={stats.meetingCount === 1 ? "meeting" : "meetings"}
        />
        {stats.busiestDay && (
          <Metric
            icon={<TrendingUpIcon className="size-3.5" />}
            value={stats.busiestDay.day.replace(/^\w+ /, "")}
            label={`busiest · ${stats.busiestDay.hours}h`}
          />
        )}
      </div>

      {stats.byDay.length > 0 && (
        <div className="flex flex-col gap-1">
          {stats.byDay.map((d) => (
            <div key={d.day} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {d.day.replace(/^\w+ /, "")}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full bg-foreground/70")}
                  style={{ width: `${(d.hours / maxHours) * 100}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {d.hours}h
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Metric({
  icon,
  value,
  label,
}: {
  icon?: React.ReactNode
  value: string
  label: string
}) {
  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-1 text-[15px] font-semibold text-foreground">
        {icon}
        {value}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}
