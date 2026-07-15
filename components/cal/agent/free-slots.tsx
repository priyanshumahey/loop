"use client"

import { format, isSameDay } from "date-fns"
import { ClockIcon, MoonIcon, SunriseIcon } from "lucide-react"

import { ConnectGoogle } from "@/components/cal/agent/connect-google"
import type { FreeSlot } from "@/lib/cal-agent/tools"

/** Hours outside of which a slot counts as early-morning or late-night. */
const EARLY_HOUR = 8
const LATE_HOUR = 20

/** Classify a slot as "early" (before 8am), "late" (after 8pm), or neither. */
function offHours(slot: FreeSlot): "early" | "late" | null {
  const start = new Date(slot.start)
  const end = new Date(slot.end)
  const startMin = start.getHours() * 60 + start.getMinutes()
  let endMin = end.getHours() * 60 + end.getMinutes()
  if (endMin === 0) endMin = 24 * 60 // midnight boundary = end of day
  if (startMin < EARLY_HOUR * 60) return "early"
  if (endMin > LATE_HOUR * 60) return "late"
  return null
}

/** Group slots into day buckets. */
function groupByDay(slots: FreeSlot[]): { day: Date; items: FreeSlot[] }[] {
  const groups: { day: Date; items: FreeSlot[] }[] = []
  for (const slot of slots) {
    const day = new Date(slot.start)
    const last = groups.at(-1)
    if (last && isSameDay(last.day, day)) last.items.push(slot)
    else groups.push({ day, items: [slot] })
  }
  return groups
}

/**
 * Generative-UI block for the `findFreeSlots` tool: open time slots grouped by
 * day, shown as chips.
 */
export function FreeSlots({
  slots,
  durationMinutes,
  connected = true,
  error,
  onPick,
}: {
  slots: FreeSlot[]
  durationMinutes: number
  connected?: boolean
  error?: string
  onPick?: (slot: FreeSlot) => void
}) {
  if (!connected && slots.length === 0) return <ConnectGoogle />
  if (error) {
    return (
      <div className="my-2 text-[12px] text-destructive">
        Couldn&apos;t find slots: {error}
      </div>
    )
  }
  if (slots.length === 0) {
    return (
      <p className="my-2 rounded-lg border border-dashed border-border/70 px-3 py-2 text-[12px] text-muted-foreground">
        No open {durationMinutes}-minute slots in that window.
      </p>
    )
  }

  const groups = groupByDay(slots)
  const hasOffHours = slots.some((s) => offHours(s) !== null)

  return (
    <div className="my-2 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
        <ClockIcon className="size-3.5" />
        Open {durationMinutes}-minute slots
        {hasOffHours && (
          <span className="text-muted-foreground/70">
            · includes early-morning / late-night times
          </span>
        )}
      </div>
      {groups.map((group) => (
        <div key={group.day.toISOString()} className="flex flex-col gap-1">
          <div className="px-0.5 text-[11px] font-medium text-muted-foreground/80">
            {format(group.day, "EEEE, MMM d")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {group.items.map((slot) => {
              const off = offHours(slot)
              return (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => onPick?.(slot)}
                  title={
                    off === "early"
                      ? "Early morning · Use this slot"
                      : off === "late"
                        ? "Late night · Use this slot"
                        : "Use this slot"
                  }
                  className="flex items-center gap-1 rounded-lg border border-border/70 bg-background px-2.5 py-1 text-[12px] text-foreground tabular-nums transition-colors hover:bg-muted/60"
                >
                  {off === "early" && (
                    <SunriseIcon className="size-3 text-amber-500" />
                  )}
                  {off === "late" && (
                    <MoonIcon className="size-3 text-indigo-400" />
                  )}
                  {format(new Date(slot.start), "h:mm a")} –{" "}
                  {format(new Date(slot.end), "h:mm a")}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
