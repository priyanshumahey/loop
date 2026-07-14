"use client"

import {
  endOfWeek,
  format,
  formatDistanceToNowStrict,
  isSameDay,
  startOfWeek,
} from "date-fns"
import {
  ArrowRightIcon,
  CalendarIcon,
  ClockIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { ConnectGoogle } from "@/components/cal/agent/connect-google"
import type { CalendarEvent, EventColor } from "@/components/event-calendar/types"
import { Spinner } from "@/components/ui/loading-screen"
import { syncEvents } from "@/lib/api/events"
import { cn } from "@/lib/utils"

const COLOR_DOT: Record<EventColor, string> = {
  sky: "bg-sky-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
  rose: "bg-rose-400",
  emerald: "bg-emerald-400",
  orange: "bg-orange-400",
}

const SUGGESTIONS = [
  "How's my week looking?",
  "How much time am I in meetings this week?",
  "Find a free 30-minute slot this week",
]

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Deterministic calendar briefing shown on /home before the user prompts. */
export function HomeBriefing({ onAsk }: { onAsk: (text: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(true)
  const [events, setEvents] = useState<CalendarEvent[]>([])

  useEffect(() => {
    let cancelled = false
    const now = new Date()
    syncEvents({ startDate: startOfWeek(now), endDate: endOfWeek(now) })
      .then((res) => {
        if (cancelled) return
        setEvents(res.events)
        setConnected(res.connected)
      })
      .catch(() => {
        if (!cancelled) setConnected(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const summary = useMemo(() => {
    const now = new Date()
    const todays = events
      .filter((e) => isSameDay(new Date(e.start), now))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

    const nextUp =
      events
        .filter((e) => !e.allDay && new Date(e.start) > now)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0] ??
      null

    const timed = events.filter((e) => !e.allDay)
    const totalHours = round1(
      timed.reduce((sum, e) => {
        const ms = new Date(e.end).getTime() - new Date(e.start).getTime()
        return sum + Math.max(0, ms) / (60 * 60 * 1000)
      }, 0)
    )

    // Overlaps among today's timed events.
    const todaysTimed = todays.filter((e) => !e.allDay)
    let conflicts = 0
    for (let i = 1; i < todaysTimed.length; i++) {
      if (
        new Date(todaysTimed[i].start) < new Date(todaysTimed[i - 1].end)
      )
        conflicts++
    }

    return {
      todays,
      nextUp,
      meetingCount: timed.length,
      totalHours,
      conflicts,
    }
  }, [events])

  const now = new Date()

  return (
    <div className="flex flex-col gap-5">
      {/* Greeting */}
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {greeting()}
        </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {format(now, "EEEE, MMMM d")}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Spinner />
          Loading your briefing…
        </div>
      ) : !connected ? (
        <ConnectGoogle />
      ) : (
        <>
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            <Stat value={String(summary.todays.length)} label="today" />
            <Stat value={String(summary.meetingCount)} label="this week" />
            <Stat value={`${summary.totalHours}h`} label="in meetings" />
          </div>

          {summary.conflicts > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              {summary.conflicts} overlapping{" "}
              {summary.conflicts === 1 ? "event" : "events"} today
            </div>
          )}

          {/* Next up */}
          {summary.nextUp && (
            <NextUp event={summary.nextUp} />
          )}

          {/* Today's agenda */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <CalendarIcon className="size-3" />
              Today
            </div>
            {summary.todays.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-[13px] text-muted-foreground">
                Nothing scheduled today. Enjoy the open time.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {summary.todays.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background px-3 py-2"
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
                      {event.allDay
                        ? "All day"
                        : format(new Date(event.start), "h:mm a")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Suggested actions */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <SparklesIcon className="size-3" />
              Ask the assistant
            </div>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onAsk(s)}
                  className="group flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  {s}
                  <ArrowRightIcon className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>

          <Link
            href="/cal"
            className="inline-flex items-center gap-1 self-start text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Open calendar
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background px-3 py-2.5">
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

function NextUp({ event }: { event: CalendarEvent }) {
  const start = new Date(event.start)
  const relative = formatDistanceToNowStrict(start, { addSuffix: true })
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/40 px-3.5 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-background">
        <ClockIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Next up · {relative}
        </div>
        <div className="truncate text-[14px] font-medium text-foreground">
          {event.title || "Untitled"}
        </div>
        <div className="text-[12px] tabular-nums text-muted-foreground">
          {format(start, "EEE h:mm a")} – {format(new Date(event.end), "h:mm a")}
        </div>
      </div>
    </div>
  )
}
