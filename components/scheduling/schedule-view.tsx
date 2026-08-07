"use client"

import {
  addDays,
  addHours,
  addMinutes,
  eachDayOfInterval,
  eachHourOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  max,
  min,
  startOfDay,
  startOfWeek,
} from "date-fns"
import { CheckIcon, PaintbrushIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { EndHour, StartHour } from "@/components/event-calendar/constants"
import {
  TimeScaleProvider,
  useTimeScale,
} from "@/components/event-calendar/time-scale-context"
import type { CalendarEvent } from "@/components/event-calendar/types"
import type {
  AvailabilityRangeAction,
  AvailabilitySlot,
  SchedulingColor,
  SchedulingEventType,
} from "@/components/scheduling/types"
import { SchedulingSetupPanel } from "@/components/scheduling/scheduling-setup-panel"
import { useSchedulingEventTypes } from "@/hooks/use-scheduling-event-types"
import { cn } from "@/lib/utils"

interface ScheduleViewProps {
  currentDate: Date
  events: CalendarEvent[]
  slots: AvailabilitySlot[]
  isSaving: boolean
  error: string | null
  onUpdateRange: (
    start: Date,
    end: Date,
    action: AvailabilityRangeAction,
    eventTypeId: string | null
  ) => Promise<boolean>
}

interface ScheduleGridProps extends ScheduleViewProps {
  eventTypes: SchedulingEventType[]
  targetEventTypeIds: string[]
}

interface Selection {
  anchor: Date
  current: Date
  action: AvailabilityRangeAction
}

const TARGET_COLOR: Record<
  SchedulingColor,
  { dot: string; block: string; text: string }
> = {
  sky: {
    dot: "bg-sky-400",
    block: "border-sky-500/40 bg-sky-400/25",
    text: "text-sky-900 dark:text-sky-100",
  },
  amber: {
    dot: "bg-amber-400",
    block: "border-amber-500/40 bg-amber-400/25",
    text: "text-amber-900 dark:text-amber-100",
  },
  violet: {
    dot: "bg-violet-400",
    block: "border-violet-500/40 bg-violet-400/25",
    text: "text-violet-900 dark:text-violet-100",
  },
  rose: {
    dot: "bg-rose-400",
    block: "border-rose-500/40 bg-rose-400/25",
    text: "text-rose-900 dark:text-rose-100",
  },
  emerald: {
    dot: "bg-emerald-400",
    block: "border-emerald-500/40 bg-emerald-400/25",
    text: "text-emerald-900 dark:text-emerald-100",
  },
  orange: {
    dot: "bg-orange-400",
    block: "border-orange-500/40 bg-orange-400/25",
    text: "text-orange-900 dark:text-orange-100",
  },
}

function AvailabilityTargetPicker({
  eventTypes,
  value,
  onChange,
}: {
  eventTypes: SchedulingEventType[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  const activeTypes = eventTypes.filter((eventType) => eventType.active)

  return (
    <div className="flex min-h-12 items-center gap-2 border-b border-border/70 bg-muted/20 px-3 py-2">
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground">
        <PaintbrushIcon className="size-3.5 text-muted-foreground" />
        Paint availability
      </span>
      <div className="h-5 w-px shrink-0 bg-border" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        <button
          className={cn(
            "shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            value.length === 0
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange([])}
          type="button"
        >
          All meetings
        </button>
        {activeTypes.map((eventType) => (
          <button
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              value.includes(eventType.id)
                ? "border-foreground/60 bg-background text-foreground shadow-sm"
                : "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground"
            )}
            key={eventType.id}
            onClick={() =>
              onChange(
                value.includes(eventType.id)
                  ? value.filter((id) => id !== eventType.id)
                  : [...value, eventType.id]
              )
            }
            type="button"
          >
            <span
              className={cn(
                "size-2 rounded-full",
                TARGET_COLOR[eventType.color].dot
              )}
            />
            {eventType.title}
            {value.includes(eventType.id) && <CheckIcon className="size-3" />}
          </button>
        ))}
        {activeTypes.length === 0 && (
          <span className="text-xs text-muted-foreground">
            Create or resume a meeting type to assign specific hours.
          </span>
        )}
      </div>
    </div>
  )
}

function cellDate(day: Date, hour: number, quarter: number) {
  const date = new Date(day)
  date.setHours(hour, quarter * 15, 0, 0)
  return date
}

function overlaps(start: Date, end: Date, rangeStart: Date, rangeEnd: Date) {
  return start < rangeEnd && end > rangeStart
}

function ScheduleGrid({
  currentDate,
  events,
  slots,
  isSaving,
  error,
  onUpdateRange,
  eventTypes,
  targetEventTypeIds,
}: ScheduleGridProps) {
  const { cellHeight, zoomContainerRef } = useTimeScale()
  const [selection, setSelection] = useState<Selection | null>(null)

  const days = useMemo(() => {
    const start = startOfWeek(currentDate)
    return eachDayOfInterval({ start, end: endOfWeek(currentDate) })
  }, [currentDate])

  const hours = useMemo(() => {
    const start = startOfDay(currentDate)
    return eachHourOfInterval({
      start: addHours(start, StartHour),
      end: addHours(start, EndHour - 1),
    })
  }, [currentDate])

  const selectedRange = selection
    ? {
        start: min([selection.anchor, selection.current]),
        end: addMinutes(max([selection.anchor, selection.current]), 15),
        action: selection.action,
      }
    : null

  const isOpen = useCallback(
    (start: Date, end: Date) =>
      (targetEventTypeIds.length === 0 ? [null] : targetEventTypeIds).every(
        (eventTypeId) =>
          slots.some(
            (slot) =>
              slot.eventTypeId === eventTypeId &&
              overlaps(start, end, slot.start, slot.end)
          )
      ),
    [slots, targetEventTypeIds]
  )

  const startSelection = useCallback(
    (start: Date, event: React.MouseEvent) => {
      if (event.button !== 0 || isSaving) return
      event.preventDefault()
      setSelection({
        anchor: start,
        current: start,
        action: isOpen(start, addMinutes(start, 15)) ? "close" : "open",
      })
    },
    [isOpen, isSaving]
  )

  const updateSelection = useCallback((current: Date) => {
    setSelection((previous) => {
      if (!previous || !isSameDay(previous.anchor, current)) return previous
      return { ...previous, current }
    })
  }, [])

  useEffect(() => {
    if (!selection) return

    const finishSelection = () => {
      const range = {
        start: min([selection.anchor, selection.current]),
        end: addMinutes(max([selection.anchor, selection.current]), 15),
        action: selection.action,
      }
      setSelection(null)
      const targets = targetEventTypeIds.length === 0 ? [null] : targetEventTypeIds
      void Promise.all(
        targets.map((eventTypeId) =>
          onUpdateRange(
            range.start,
            range.end,
            range.action,
            eventTypeId
          )
        )
      )
    }
    window.addEventListener("mouseup", finishSelection, { once: true })
    return () => window.removeEventListener("mouseup", finishSelection)
  }, [selection, onUpdateRange, targetEventTypeIds])

  const eventTypeById = useMemo(
    () => new Map(eventTypes.map((eventType) => [eventType.id, eventType])),
    [eventTypes]
  )

  const positionedRanges = useCallback(
    (day: Date) => {
      const dayStart = startOfDay(day)
      const dayEnd = addDays(dayStart, 1)
      const groups = new Map<
        string,
        {
          ids: string[]
          start: Date
          end: Date
          shared: boolean
          eventTypes: SchedulingEventType[]
        }
      >()

      for (const slot of slots) {
        if (!overlaps(slot.start, slot.end, dayStart, dayEnd)) continue
        const start = max([slot.start, dayStart])
        const end = min([slot.end, dayEnd])
        const key = `${start.getTime()}-${end.getTime()}`
        const group = groups.get(key) ?? {
          ids: [],
          start,
          end,
          shared: false,
          eventTypes: [],
        }
        group.ids.push(slot.id)
        if (slot.eventTypeId) {
          const eventType = eventTypeById.get(slot.eventTypeId)
          if (eventType) group.eventTypes.push(eventType)
        } else {
          group.shared = true
        }
        groups.set(key, group)
      }

      const ranges = [...groups.values()].map((group) => {
        const startMinutes =
          (group.start.getTime() - dayStart.getTime()) / 60_000
        const durationMinutes =
          (group.end.getTime() - group.start.getTime()) / 60_000
        const name = group.shared
          ? "All meetings"
          : group.eventTypes.length === 1
            ? group.eventTypes[0]!.title
            : `${group.eventTypes.length} meeting types`
        return {
          id: group.ids.join("-"),
          eventTypeIds: group.eventTypes.map((eventType) => eventType.id),
          eventTypes: group.eventTypes,
          shared: group.shared,
          top: (startMinutes / 60) * cellHeight,
          height: (durationMinutes / 60) * cellHeight,
          lane: 0,
          laneCount: 1,
          name,
          timeLabel: `${format(group.start, "h:mm a")}–${format(group.end, "h:mm a")}`,
        }
      })

      const layoutCluster = (cluster: typeof ranges) => {
        const laneEnds: number[] = []
        for (const range of cluster) {
          let lane = laneEnds.findIndex((end) => end <= range.top)
          if (lane === -1) lane = laneEnds.length
          range.lane = lane
          laneEnds[lane] = range.top + range.height
        }
        const laneCount = Math.max(laneEnds.length, 1)
        for (const range of cluster) range.laneCount = laneCount
      }

      let cluster: typeof ranges = []
      let clusterEnd = -1
      for (const range of [...ranges].sort((a, b) => a.top - b.top)) {
        if (cluster.length > 0 && range.top >= clusterEnd) {
          layoutCluster(cluster)
          cluster = []
          clusterEnd = -1
        }
        cluster.push(range)
        clusterEnd = Math.max(clusterEnd, range.top + range.height)
      }
      if (cluster.length > 0) layoutCluster(cluster)

      return ranges.map((range) => ({
        ...range,
        left: (range.lane / range.laneCount) * 100,
        width: 100 / range.laneCount,
      }))
    },
    [slots, cellHeight, eventTypeById]
  )

  const positionedEvents = useCallback(
    (day: Date) => {
      const dayStart = startOfDay(day)
      const dayEnd = addDays(dayStart, 1)
      return events
        .filter(
          (event) =>
            !event.allDay &&
            overlaps(new Date(event.start), new Date(event.end), dayStart, dayEnd)
        )
        .map((event) => {
          const start = max([new Date(event.start), dayStart])
          const end = min([new Date(event.end), dayEnd])
          const startMinutes = (start.getTime() - dayStart.getTime()) / 60_000
          const durationMinutes = (end.getTime() - start.getTime()) / 60_000
          return {
            event,
            top: (startMinutes / 60) * cellHeight,
            height: Math.max((durationMinutes / 60) * cellHeight, 16),
          }
        })
    },
    [events, cellHeight]
  )

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ "--week-cells-height": `${cellHeight}px` } as React.CSSProperties}
    >
      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex-1 overflow-auto overscroll-none" ref={zoomContainerRef}>
        <div className="sticky top-0 z-40 grid grid-cols-8 border-b border-border/70 bg-background">
          <div className="py-2 text-center text-xs text-muted-foreground">
            <span className="max-[479px]:sr-only">{format(new Date(), "O")}</span>
          </div>
          {days.map((day) => (
            <div
              className="py-2 text-center text-xs text-muted-foreground data-today:font-semibold data-today:text-emerald-700 sm:text-sm dark:data-today:text-emerald-400"
              data-today={isToday(day) || undefined}
              key={day.toISOString()}
            >
              <span className="sm:hidden">
                {format(day, "EEEEE")} {format(day, "d")}
              </span>
              <span className="max-sm:hidden">{format(day, "EEE dd")}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-8" style={{ minHeight: 600 }}>
          <div className="border-r border-border/70">
            {hours.map((hour, index) => (
              <div
                className="relative h-[var(--week-cells-height)] border-b border-border/70 last:border-b-0"
                key={hour.toISOString()}
              >
                {index > 0 && (
                  <span className="absolute -top-3 left-0 flex h-6 w-16 max-w-full items-center justify-end bg-background pe-2 text-xs text-muted-foreground sm:pe-4">
                    {format(hour, "h a")}
                  </span>
                )}
              </div>
            ))}
          </div>

          {days.map((day) => (
            <div
              className={cn(
                "relative border-r border-border/70 last:border-r-0",
                isToday(day) && "bg-emerald-50/40 dark:bg-emerald-950/10"
              )}
              key={day.toISOString()}
            >
              {positionedRanges(day).map((range) => (
                <div
                  className={cn(
                    "pointer-events-none absolute z-0 overflow-hidden rounded-md border px-1.5 py-1 text-[10px] font-medium",
                    !range.shared && range.eventTypes.length === 1
                      ? TARGET_COLOR[range.eventTypes[0]!.color].block
                      : "border-foreground/25 bg-foreground/10",
                    !range.shared && range.eventTypes.length === 1
                      ? TARGET_COLOR[range.eventTypes[0]!.color].text
                      : "text-foreground/80",
                    targetEventTypeIds.length === 0
                      ? !range.shared && "opacity-35"
                      : !range.shared &&
                          !range.eventTypeIds.some((id) =>
                            targetEventTypeIds.includes(id)
                          ) &&
                          "opacity-20",
                    range.eventTypeIds.some((id) =>
                      targetEventTypeIds.includes(id)
                    ) &&
                      "z-[2] opacity-100",
                    range.shared && targetEventTypeIds.length === 0 &&
                      "z-[2] opacity-100"
                  )}
                  key={range.id}
                  style={{
                    top: range.top,
                    height: range.height,
                    left: `calc(${range.left}% + 2px)`,
                    width: `calc(${range.width}% - 4px)`,
                  }}
                >
                  <div className="flex items-center gap-1 overflow-hidden leading-tight">
                    {!range.shared &&
                      range.eventTypes.slice(0, 3).map((eventType) => (
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            TARGET_COLOR[eventType.color].dot
                          )}
                          key={eventType.id}
                        />
                      ))}
                    <span className="truncate">{range.name}</span>
                  </div>
                  {range.height >= 32 && (
                    <div className="mt-0.5 truncate text-[9px] font-normal opacity-70">
                      {range.timeLabel}
                    </div>
                  )}
                </div>
              ))}

              {positionedEvents(day).map(({ event, top, height }) => (
                <div
                  className="pointer-events-none absolute inset-x-1 z-10 overflow-hidden rounded-sm border border-border bg-muted/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
                  key={event.id}
                  style={{ top, height }}
                >
                  <span className="block truncate">{event.title}</span>
                </div>
              ))}

              {hours.map((hour) =>
                [0, 1, 2, 3].map((quarter) => {
                  const start = cellDate(day, hour.getHours(), quarter)
                  const end = addMinutes(start, 15)
                  const selected = selectedRange
                    ? overlaps(start, end, selectedRange.start, selectedRange.end)
                    : false
                  return (
                    <button
                      aria-label={`${format(start, "EEEE h:mm a")} availability`}
                      className={cn(
                        "relative z-20 block h-[calc(var(--week-cells-height)/4)] w-full border-b border-border/30 transition-colors",
                        quarter === 3 && "border-border/70",
                        selected &&
                          selectedRange?.action === "open" &&
                          "bg-foreground/15",
                        selected &&
                          selectedRange?.action === "close" &&
                          "bg-rose-400/30"
                      )}
                      key={`${hour.toISOString()}-${quarter}`}
                      onMouseDown={(event) => startSelection(start, event)}
                      onMouseEnter={() => updateSelection(start)}
                      type="button"
                    />
                  )
                })
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ScheduleView(props: ScheduleViewProps) {
  const scheduling = useSchedulingEventTypes()
  const [targetEventTypeIds, setTargetEventTypeIds] = useState<string[]>([])

  const activeIds = new Set(
    scheduling.eventTypes
      .filter((eventType) => eventType.active)
      .map((eventType) => eventType.id)
  )
  const effectiveTargetIds = targetEventTypeIds.filter((id) => activeIds.has(id))

  return (
    <div className="flex h-full min-w-0 flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
        <AvailabilityTargetPicker
          eventTypes={scheduling.eventTypes}
          onChange={setTargetEventTypeIds}
          value={effectiveTargetIds}
        />
        <div className="min-h-0 flex-1">
          <TimeScaleProvider>
            <ScheduleGrid
              {...props}
              eventTypes={scheduling.eventTypes}
              targetEventTypeIds={effectiveTargetIds}
            />
          </TimeScaleProvider>
        </div>
      </div>
      <SchedulingSetupPanel
        onSelectAvailabilityTarget={(id) => setTargetEventTypeIds([id])}
        scheduling={scheduling}
        selectedAvailabilityTargetIds={effectiveTargetIds}
      />
    </div>
  )
}
