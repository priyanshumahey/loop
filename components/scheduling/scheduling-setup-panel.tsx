"use client"

import {
  CalendarClockIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  ExternalLinkIcon,
  PaintbrushIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react"
import { useState } from "react"

import { MeetingTypeDialog } from "@/components/scheduling/meeting-type-dialog"
import type {
  SchedulingColor,
  SchedulingEventType,
} from "@/components/scheduling/types"
import { Button } from "@/components/ui/button"
import type { EventTypeInput } from "@/lib/api/scheduling"
import { useSchedulingEventTypes } from "@/hooks/use-scheduling-event-types"
import { formatDuration } from "@/components/scheduling/utils"
import { cn } from "@/lib/utils"

const COLOR_DOT: Record<SchedulingColor, string> = {
  sky: "bg-sky-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
  rose: "bg-rose-400",
  emerald: "bg-emerald-400",
  orange: "bg-orange-400",
}

function toEventTypeInput(eventType: SchedulingEventType): EventTypeInput {
  return {
    id: eventType.id,
    title: eventType.title,
    slug: eventType.slug,
    description: eventType.description,
    durationMinutes: eventType.durationMinutes,
    bufferBeforeMinutes: eventType.bufferBeforeMinutes,
    bufferAfterMinutes: eventType.bufferAfterMinutes,
    minNoticeMinutes: eventType.minNoticeMinutes,
    bookingWindowDays: eventType.bookingWindowDays,
    slotIncrementMinutes: eventType.slotIncrementMinutes,
    location: eventType.location,
    color: eventType.color,
    active: eventType.active,
    timezone: eventType.timezone,
    weeklyAvailability: eventType.weeklyAvailability,
  }
}

function ActiveSwitch({
  active,
  disabled,
  onToggle,
}: {
  active: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      aria-checked={active}
      aria-label={active ? "Pause bookings" : "Resume bookings"}
      className={cn(
        "relative h-4 w-7 shrink-0 rounded-full transition-colors disabled:opacity-50",
        active ? "bg-emerald-500" : "bg-muted-foreground/30"
      )}
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          "absolute top-0.5 size-3 rounded-full bg-white shadow-sm transition-transform",
          active ? "translate-x-3.5" : "translate-x-0.5"
        )}
      />
    </button>
  )
}

function bookingUrl(slug: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin
  return `${origin}/schedule/${slug}`
}

function MeetingTypeCard({
  eventType,
  isSaving,
  onSave,
  onToggle,
  onDelete,
  onAssignHours,
  isAssigningHours,
  error,
}: {
  eventType: SchedulingEventType
  isSaving: boolean
  onSave: ReturnType<typeof useSchedulingEventTypes>["save"]
  onToggle: (eventType: SchedulingEventType) => void
  onDelete: (id: string) => Promise<boolean>
  onAssignHours: (id: string) => void
  isAssigningHours: boolean
  error: string | null
}) {
  const [copied, setCopied] = useState(false)
  const url = bookingUrl(eventType.slug)

  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-3 transition-colors",
        isAssigningHours
          ? "border-foreground/40 shadow-sm ring-1 ring-foreground/10"
          : "border-border/70 hover:border-border",
        !eventType.active && "bg-muted/25"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                COLOR_DOT[eventType.color],
                !eventType.active && "opacity-40"
              )}
            />
            <h3 className="truncate text-[13px] font-semibold text-foreground">
              {eventType.title}
            </h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-4 text-[11px] text-muted-foreground">
            <ClockIcon className="size-3" />
            <span className="tabular-nums">
              {formatDuration(eventType.durationMinutes)}
            </span>
            {eventType.location && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{eventType.location}</span>
              </>
            )}
            {eventType.weeklyAvailability.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {eventType.weeklyAvailability.length} days · {eventType.timezone}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            aria-label={`Assign hours for ${eventType.title}`}
            aria-pressed={isAssigningHours}
            className={cn(
              "transition-colors",
              isAssigningHours && "bg-secondary text-secondary-foreground"
            )}
            disabled={!eventType.active}
            onClick={() => onAssignHours(eventType.id)}
            size="icon-xs"
            title="Assign availability"
            variant="ghost"
          >
            <PaintbrushIcon />
          </Button>
          <MeetingTypeDialog
            error={error}
            initial={eventType}
            isSaving={isSaving}
            onDelete={onDelete}
            onSave={onSave}
            trigger={
              <Button
                aria-label={`Edit ${eventType.title}`}
                className="text-muted-foreground hover:text-foreground"
                size="icon-xs"
                title="Edit meeting type"
                variant="ghost"
              >
                <PencilIcon />
              </Button>
            }
          />
          <ActiveSwitch
            active={eventType.active}
            disabled={isSaving}
            onToggle={() => onToggle(eventType)}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1">
        <Button
          aria-label="Copy booking link"
          className="h-7 min-w-0 flex-1 gap-1.5 text-[11px]"
          disabled={!eventType.active}
          onClick={() => {
            void navigator.clipboard.writeText(url)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          }}
          size="sm"
          variant="outline"
          title={`/schedule/${eventType.slug}`}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button
          aria-label="Open booking page"
          className="size-7"
          disabled={!eventType.active}
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          size="icon-sm"
          variant="outline"
        >
          <ExternalLinkIcon />
        </Button>
      </div>
    </div>
  )
}

function EmptyState({
  isSaving,
  onSave,
  error,
}: {
  isSaving: boolean
  onSave: ReturnType<typeof useSchedulingEventTypes>["save"]
  error: string | null
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-border/70 bg-muted/40 text-muted-foreground">
        <CalendarClockIcon className="size-5" />
      </span>
      <h3 className="mt-3 text-sm font-semibold">No booking pages yet</h3>
      <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
        Turn your open slots into a shareable link people can book — meetings land
        straight on your calendar.
      </p>
      <MeetingTypeDialog
        error={error}
        initial={null}
        isSaving={isSaving}
        onSave={onSave}
        trigger={
          <Button className="mt-4 gap-1.5" size="sm">
            <PlusIcon />
            Create booking page
          </Button>
        }
      />
    </div>
  )
}

export function SchedulingSetupPanel({
  scheduling,
  selectedAvailabilityTargetIds,
  onSelectAvailabilityTarget,
}: {
  scheduling: ReturnType<typeof useSchedulingEventTypes>
  selectedAvailabilityTargetIds: string[]
  onSelectAvailabilityTarget: (id: string) => void
}) {
  const { eventTypes, isLoading, isSaving, error, save, remove } = scheduling

  const activeCount = eventTypes.filter((eventType) => eventType.active).length
  const activeTypes = eventTypes.filter((eventType) => eventType.active)
  const pausedTypes = eventTypes.filter((eventType) => !eventType.active)

  const handleSave: typeof save = async (input) => {
    return save(input)
  }

  const handleToggle = async (eventType: SchedulingEventType) => {
    await save({
      ...toEventTypeInput(eventType),
      active: !eventType.active,
    })
  }

  const handleDelete = async (id: string) => {
    return remove(id)
  }

  return (
    <aside className="flex max-h-[46%] w-full shrink-0 flex-col border-t border-border/70 bg-muted/20 lg:h-full lg:max-h-none lg:w-[320px] lg:border-t-0 lg:border-l">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Meeting types</h2>
          <p className="text-xs text-muted-foreground">
            {eventTypes.length === 0
              ? "Share your availability"
              : `${activeCount} live · ${eventTypes.length} total`}
          </p>
        </div>
        {eventTypes.length > 0 && (
          <MeetingTypeDialog
            error={error}
            initial={null}
            isSaving={isSaving}
            onSave={handleSave}
            trigger={
              <Button className="gap-1.5" size="sm" variant="outline">
                <PlusIcon />
                New
              </Button>
            }
          />
        )}
      </div>

      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : eventTypes.length === 0 ? (
        <EmptyState error={error} isSaving={isSaving} onSave={handleSave} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {activeTypes.length > 0 && (
            <section className="space-y-2">
              <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Live
              </h3>
              {activeTypes.map((eventType) => (
                <MeetingTypeCard
                  eventType={eventType}
                  error={error}
                  isAssigningHours={selectedAvailabilityTargetIds.includes(eventType.id)}
                  isSaving={isSaving}
                  key={eventType.id}
                  onDelete={handleDelete}
                  onAssignHours={onSelectAvailabilityTarget}
                  onSave={handleSave}
                  onToggle={handleToggle}
                />
              ))}
            </section>
          )}

          {pausedTypes.length > 0 && (
            <section className="mt-4 space-y-2 border-t border-border/60 pt-3">
              <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                Paused
              </h3>
              {pausedTypes.map((eventType) => (
                <MeetingTypeCard
                  eventType={eventType}
                  error={error}
                  isAssigningHours={false}
                  isSaving={isSaving}
                  key={eventType.id}
                  onDelete={handleDelete}
                  onAssignHours={onSelectAvailabilityTarget}
                  onSave={handleSave}
                  onToggle={handleToggle}
                />
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  )
}
