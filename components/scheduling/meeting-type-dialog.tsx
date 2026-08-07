"use client"

import { ChevronDownIcon, LinkIcon, Trash2Icon, VideoIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import type {
  SchedulingColor,
  SchedulingEventType,
  WeeklyAvailabilityRule,
} from "@/components/scheduling/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { EventTypeInput } from "@/lib/api/scheduling"
import {
  formatDurationShort,
  minuteToTime,
  slugify,
  timeToMinute,
} from "@/components/scheduling/utils"
import { cn } from "@/lib/utils"

const DURATION_PRESETS = [15, 30, 45, 60, 90]
const BUFFERS = [0, 5, 10, 15, 30, 45, 60]
const SLOT_INCREMENTS = [5, 10, 15, 20, 30, 60]
const WEEKDAYS: { value: WeeklyAvailabilityRule["dayOfWeek"]; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
]

const MIN_NOTICE_OPTIONS = [
  { value: 0, label: "No minimum" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "1 day" },
  { value: 2880, label: "2 days" },
]

const BOOKING_WINDOW_OPTIONS = [
  { value: 7, label: "1 week out" },
  { value: 14, label: "2 weeks out" },
  { value: 30, label: "30 days out" },
  { value: 60, label: "60 days out" },
  { value: 90, label: "90 days out" },
  { value: 365, label: "1 year out" },
]

const COLORS: { value: SchedulingColor; swatch: string }[] = [
  { value: "sky", swatch: "bg-sky-400" },
  { value: "emerald", swatch: "bg-emerald-400" },
  { value: "violet", swatch: "bg-violet-400" },
  { value: "amber", swatch: "bg-amber-400" },
  { value: "orange", swatch: "bg-orange-400" },
  { value: "rose", swatch: "bg-rose-400" },
]

// Only Google Meet is supported for now.
const MEET_LOCATION = "Google Meet"

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
      {children}
    </p>
  )
}

function NativeSelect<T extends number>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="relative">
      <select
        className="h-8 w-full appearance-none rounded-lg border border-input bg-transparent pl-2.5 pr-7 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={(event) => onChange(Number(event.target.value) as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
    </div>
  )
}

function DurationPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {DURATION_PRESETS.map((minutes) => (
        <button
          className={cn(
            "h-8 min-w-11 rounded-lg border px-2 text-sm font-medium tabular-nums transition-colors",
            value === minutes
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          key={minutes}
          onClick={() => onChange(minutes)}
          type="button"
        >
          {formatDurationShort(minutes)}
        </button>
      ))}
      <div className="flex items-center gap-1 rounded-lg border border-border pl-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <input
          aria-label="Custom duration in minutes"
          className="h-8 w-11 bg-transparent text-sm tabular-nums outline-none"
          inputMode="numeric"
          max={480}
          min={5}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) {
              onChange(Math.max(5, Math.min(480, Math.round(next))))
            }
          }}
          type="number"
          value={value}
        />
        <span className="pr-2 text-xs text-muted-foreground">min</span>
      </div>
    </div>
  )
}

export function MeetingTypeDialog({
  trigger,
  initial,
  isSaving,
  onSave,
  onDelete,
  error,
}: {
  trigger: ReactNode
  initial: SchedulingEventType | null
  isSaving: boolean
  onSave: (input: EventTypeInput) => Promise<SchedulingEventType | null>
  onDelete?: (id: string) => Promise<boolean>
  error?: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <MeetingTypeForm
          initial={initial}
          isSaving={isSaving}
          error={error}
          key={initial?.id ?? "new"}
          onDelete={
            onDelete && initial
              ? async () => {
                  const removed = await onDelete(initial.id)
                  if (removed) setOpen(false)
                }
              : undefined
          }
          onSave={async (input) => {
            const saved = await onSave(input)
            if (saved) setOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function MeetingTypeForm({
  initial,
  isSaving,
  onSave,
  onDelete,
  error,
}: {
  initial: SchedulingEventType | null
  isSaving: boolean
  onSave: (input: EventTypeInput) => Promise<void>
  onDelete?: () => Promise<void>
  error?: string | null
}) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [slug, setSlug] = useState(initial?.slug ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [durationMinutes, setDurationMinutes] = useState(
    initial?.durationMinutes ?? 30
  )
  const [bufferBeforeMinutes, setBufferBeforeMinutes] = useState(
    initial?.bufferBeforeMinutes ?? 0
  )
  const [bufferAfterMinutes, setBufferAfterMinutes] = useState(
    initial?.bufferAfterMinutes ?? 0
  )
  const [minNoticeMinutes, setMinNoticeMinutes] = useState(
    initial?.minNoticeMinutes ?? 0
  )
  const [bookingWindowDays, setBookingWindowDays] = useState(
    initial?.bookingWindowDays ?? 14
  )
  const [slotIncrementMinutes, setSlotIncrementMinutes] = useState(
    initial?.slotIncrementMinutes ?? 15
  )
  const [color, setColor] = useState<SchedulingColor>(
    initial?.color ?? "emerald"
  )
  const [active, setActive] = useState(initial?.active ?? true)
  const [timezone, setTimezone] = useState(
    initial?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [weeklyAvailability, setWeeklyAvailability] = useState<
    WeeklyAvailabilityRule[]
  >(
    initial?.weeklyAvailability ??
      WEEKDAYS.slice(0, 5).map(({ value }) => ({
        dayOfWeek: value,
        startMinute: 9 * 60,
        endMinute: 17 * 60,
      }))
  )
  const [slugEdited, setSlugEdited] = useState(Boolean(initial))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!confirmingDelete) return
    const timer = setTimeout(() => setConfirmingDelete(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmingDelete])

  const effectiveSlug = slug || slugify(title)

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!title.trim()) {
          setValidationError("Give your meeting type a name.")
          return
        }
        if (effectiveSlug.length < 3) {
          setValidationError("The booking link needs at least 3 characters.")
          return
        }
        setValidationError(null)
        void onSave({
          id: initial?.id,
          title: title.trim(),
          slug: effectiveSlug,
          description: description.trim() || null,
          durationMinutes,
          bufferBeforeMinutes,
          bufferAfterMinutes,
          minNoticeMinutes,
          bookingWindowDays,
          slotIncrementMinutes,
          location: MEET_LOCATION,
          color,
          active,
          timezone,
          weeklyAvailability,
        })
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {initial ? "Edit meeting type" : "New meeting type"}
        </DialogTitle>
        <DialogDescription>
          People pick from your open availability, minus anything already on your
          calendar.
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[min(64vh,34rem)] flex-col gap-6 overflow-y-auto pr-1">
        <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
          {/* Left: identity */}
          <div className="flex flex-col gap-4">
            <SectionLabel>Details</SectionLabel>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meeting-title">Name</Label>
              <Input
                autoFocus
                id="meeting-title"
                maxLength={120}
                onChange={(event) => {
                  const next = event.target.value
                  setTitle(next)
                  setValidationError(null)
                  if (!slugEdited) setSlug(slugify(next))
                }}
                placeholder="Intro call"
                value={title}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meeting-description">Description</Label>
              <Textarea
                className="min-h-[76px]"
                id="meeting-description"
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add context guests see before they book (optional)."
                rows={3}
                value={description}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Location</Label>
              <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-2.5 py-2 text-sm">
                <VideoIcon className="size-4 text-muted-foreground" />
                <span className="font-medium">Google Meet</span>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  Default
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Event color</Label>
              <div className="flex items-center gap-2">
                {COLORS.map((option) => (
                  <button
                    aria-label={`${option.value} color`}
                    aria-pressed={color === option.value}
                    className={cn(
                      "grid size-7 place-items-center rounded-full transition-transform hover:scale-105",
                      color === option.value &&
                        "ring-2 ring-foreground ring-offset-2 ring-offset-surface"
                    )}
                    key={option.value}
                    onClick={() => setColor(option.value)}
                    type="button"
                  >
                    <span className={cn("size-4 rounded-full", option.swatch)} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: timing + rules */}
          <div className="flex flex-col gap-4">
            <SectionLabel>Duration &amp; spacing</SectionLabel>

            <div className="flex flex-col gap-1.5">
              <Label>Meeting length</Label>
              <DurationPicker
                onChange={setDurationMinutes}
                value={durationMinutes}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Before
                </span>
                <NativeSelect
                  onChange={setBufferBeforeMinutes}
                  options={BUFFERS.map((minutes) => ({
                    value: minutes,
                    label: minutes === 0 ? "None" : `${minutes}m`,
                  }))}
                  value={bufferBeforeMinutes}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  After
                </span>
                <NativeSelect
                  onChange={setBufferAfterMinutes}
                  options={BUFFERS.map((minutes) => ({
                    value: minutes,
                    label: minutes === 0 ? "None" : `${minutes}m`,
                  }))}
                  value={bufferAfterMinutes}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Interval
                </span>
                <NativeSelect
                  onChange={setSlotIncrementMinutes}
                  options={SLOT_INCREMENTS.map((minutes) => ({
                    value: minutes,
                    label: `${minutes}m`,
                  }))}
                  value={slotIncrementMinutes}
                />
              </label>
            </div>

            <div className="mt-1 flex flex-col gap-1">
              <SectionLabel>Booking rules</SectionLabel>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Minimum notice
                </span>
                <NativeSelect
                  onChange={setMinNoticeMinutes}
                  options={MIN_NOTICE_OPTIONS}
                  value={minNoticeMinutes}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Booking window
                </span>
                <NativeSelect
                  onChange={setBookingWindowDays}
                  options={BOOKING_WINDOW_OPTIONS}
                  value={bookingWindowDays}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Link */}
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-5">
          <Label htmlFor="meeting-slug">Booking link</Label>
          <div className="flex items-center rounded-lg border border-input bg-muted/30 pl-2.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <LinkIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
            <span className="shrink-0 pl-1.5 text-xs text-muted-foreground">
              /schedule/
            </span>
            <input
              className="h-8 min-w-0 flex-1 bg-transparent px-0.5 text-sm outline-none"
              id="meeting-slug"
              onChange={(event) => {
                setSlug(slugify(event.target.value))
                setSlugEdited(true)
                setValidationError(null)
              }}
              placeholder="intro-call"
              value={slug}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border/60 pt-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <SectionLabel>Weekly hours</SectionLabel>
              <p className="mt-1 text-xs text-muted-foreground">
                Painted calendar ranges remain available as one-off openings.
              </p>
            </div>
            <label className="flex w-48 flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">
                Timezone
              </span>
              <Input
                aria-label="Scheduling timezone"
                className="h-8 text-xs"
                maxLength={100}
                onChange={(event) => setTimezone(event.target.value)}
                value={timezone}
              />
            </label>
          </div>

          <div className="divide-y divide-border/60 rounded-lg border border-border/70">
            {WEEKDAYS.map((day) => {
              const rule = weeklyAvailability.find(
                (candidate) => candidate.dayOfWeek === day.value
              )
              return (
                <div
                  className="grid min-h-10 grid-cols-[64px_1fr] items-center gap-3 px-3 py-1.5"
                  key={day.value}
                >
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input
                      checked={Boolean(rule)}
                      className="size-3.5 accent-foreground"
                      onChange={(event) => {
                        setWeeklyAvailability((current) =>
                          event.target.checked
                            ? [
                                ...current,
                                {
                                  dayOfWeek: day.value,
                                  startMinute: 9 * 60,
                                  endMinute: 17 * 60,
                                },
                              ]
                            : current.filter(
                                (candidate) => candidate.dayOfWeek !== day.value
                              )
                        )
                      }}
                      type="checkbox"
                    />
                    {day.label}
                  </label>
                  {rule ? (
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`${day.label} start time`}
                        className="h-7 text-xs tabular-nums"
                        onChange={(event) => {
                          const startMinute = timeToMinute(event.target.value)
                          setWeeklyAvailability((current) =>
                            current.map((candidate) =>
                              candidate.dayOfWeek === day.value
                                ? { ...candidate, startMinute }
                                : candidate
                            )
                          )
                        }}
                        type="time"
                        value={minuteToTime(rule.startMinute)}
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        aria-label={`${day.label} end time`}
                        className="h-7 text-xs tabular-nums"
                        onChange={(event) => {
                          const endMinute = timeToMinute(event.target.value)
                          setWeeklyAvailability((current) =>
                            current.map((candidate) =>
                              candidate.dayOfWeek === day.value
                                ? { ...candidate, endMinute }
                                : candidate
                            )
                          )
                        }}
                        type="time"
                        value={minuteToTime(rule.endMinute)}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Unavailable</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <button
          aria-pressed={active}
          className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
          onClick={() => setActive((value) => !value)}
          type="button"
        >
          <span className="flex flex-col">
            <span className="text-sm font-medium">Accept bookings</span>
            <span className="text-xs text-muted-foreground">
              {active ? "Live and bookable" : "Paused — link shows nothing"}
            </span>
          </span>
          <span
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors",
              active ? "bg-emerald-500" : "bg-muted-foreground/30"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
                active ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </span>
        </button>
      </div>

      {(validationError || error) && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {validationError || error}
        </p>
      )}

      <DialogFooter className={cn(onDelete && "sm:justify-between")}>
        {onDelete && (
          <Button
            className={cn(
              "sm:mr-auto",
              confirmingDelete && "bg-destructive/20"
            )}
            disabled={isSaving}
            onClick={() => {
              if (confirmingDelete) {
                void onDelete()
              } else {
                setConfirmingDelete(true)
              }
            }}
            type="button"
            variant="destructive"
          >
            <Trash2Icon />
            {confirmingDelete ? "Click to confirm" : "Delete"}
          </Button>
        )}
        <Button disabled={isSaving} type="submit">
          {isSaving ? "Saving…" : initial ? "Save changes" : "Create booking page"}
        </Button>
      </DialogFooter>
    </form>
  )
}
