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
import {
  AgentCard,
  AgentNotice,
  LoadingState,
  StarterPromptList,
} from "@/components/agent"
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
        <LoadingState label="Loading your briefing…" variant="dots" />
      ) : !connected ? (
        <ConnectGoogle />
      ) : (
        <>
          {/* Quick stats */}
          <AgentCard
            title="This week"
            icon={<SparklesIcon className="size-3.5" />}
            bodyClassName="grid grid-cols-3 gap-3"
          >
            <Stat value={String(summary.todays.length)} label="today" />
            <Stat value={String(summary.meetingCount)} label="meetings" />
            <Stat value={`${summary.totalHours}h`} label="scheduled" />
          </AgentCard>

          {summary.conflicts > 0 && (
            <AgentNotice
              icon={<TriangleAlertIcon className="size-3.5" />}
              title={`${summary.conflicts} overlapping ${summary.conflicts === 1 ? "event" : "events"}`}
              description="Your calendar has a conflict today."
              tone="warning"
              className="my-0"
            />
          )}

          {/* Next up */}
          {summary.nextUp && (
            <NextUp event={summary.nextUp} />
          )}

          {/* Today's agenda */}
          <AgentCard
            title="Today"
            icon={<CalendarIcon className="size-3.5" />}
            meta={`${summary.todays.length} ${summary.todays.length === 1 ? "event" : "events"}`}
            bodyClassName="p-0"
          >
            {summary.todays.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-muted-foreground">
                Nothing scheduled today. Enjoy the open time.
              </p>
            ) : (
              <div className="flex flex-col">
                {summary.todays.map((event) => (
                  <div
                    key={event.id}
                    className="flex min-h-10 items-center gap-2.5 border-b border-line px-3 last:border-b-0"
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
          </AgentCard>

          {/* Suggested actions */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <SparklesIcon className="size-3" />
              Ask the assistant
            </div>
            <StarterPromptList
              items={SUGGESTIONS}
              onPick={onAsk}
            />
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
    <div className="min-w-0">
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

function NextUp({ event }: { event: CalendarEvent }) {
  const start = new Date(event.start)
  const relative = formatDistanceToNowStrict(start, { addSuffix: true })
  return (
    <AgentCard
      title="Next up"
      icon={<ClockIcon className="size-3.5" />}
      meta={relative}
    >
      <div className="min-w-0">
        <div className="truncate text-[14px] font-medium text-ink">
          {event.title || "Untitled"}
        </div>
        <div className="text-[12px] tabular-nums text-ink-3">
          {format(start, "EEE h:mm a")} – {format(new Date(event.end), "h:mm a")}
        </div>
      </div>
    </AgentCard>
  )
}
