"use client"

import { addDays, format } from "date-fns"
import {
  CalendarRangeIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LinkIcon,
  PauseIcon,
  PlayIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import * as sharesApi from "@/lib/api/calendar-shares"
import type {
  CalendarShare,
  CalendarShareView,
  CalendarShareWeekday,
} from "@/lib/db/calendar-shares"
import { cn } from "@/lib/utils"

const VIEWS: { value: CalendarShareView; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "agenda", label: "Agenda" },
]

const WEEKDAYS: { value: CalendarShareWeekday; label: string }[] = [
  { value: 0, label: "S" },
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
]

const ALL_WEEKDAYS = WEEKDAYS.map((day) => day.value)

function dateInput(offsetDays = 0) {
  return format(addDays(new Date(), offsetDays), "yyyy-MM-dd")
}

function WeekdayPicker({
  value,
  onChange,
}: {
  value: CalendarShareWeekday[]
  onChange: (value: CalendarShareWeekday[]) => void
}) {
  return (
    <div className="grid grid-cols-7 gap-1" aria-label="Visible weekdays">
      {WEEKDAYS.map((day) => {
        const selected = value.includes(day.value)
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "grid h-8 place-items-center rounded-md border text-xs font-semibold transition-colors",
              selected
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            )}
            key={day.value}
            onClick={() => {
              if (selected && value.length === 1) return
              onChange(
                selected
                  ? value.filter((item) => item !== day.value)
                  : [...value, day.value].sort()
              )
            }}
            title={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day.value]}
            type="button"
          >
            {day.label}
          </button>
        )
      })}
    </div>
  )
}

function ShareLimitsEditor({
  share,
  onSave,
}: {
  share: CalendarShare
  onSave: (updates: Pick<CalendarShare, "startDate" | "endDate" | "visibleWeekdays">) => Promise<void>
}) {
  const [startDate, setStartDate] = useState(share.startDate)
  const [endDate, setEndDate] = useState(share.endDate)
  const [visibleWeekdays, setVisibleWeekdays] = useState(share.visibleWeekdays)
  const [saving, setSaving] = useState(false)

  return (
    <div className="space-y-3 border-t border-border/70 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          First visible day
          <Input
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
            type="date"
            value={startDate}
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Last visible day
          <Input
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
            type="date"
            value={endDate}
          />
        </label>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Visible days</p>
        <WeekdayPicker onChange={setVisibleWeekdays} value={visibleWeekdays} />
      </div>
      <Button
        className="w-full"
        disabled={saving || !startDate || !endDate || endDate < startDate}
        onClick={async () => {
          setSaving(true)
          await onSave({ startDate, endDate, visibleWeekdays })
          setSaving(false)
        }}
        size="sm"
      >
        {saving ? "Saving…" : "Save limits"}
      </Button>
    </div>
  )
}

export function CalendarShareDialog({
  triggerVariant = "sidebar",
}: {
  triggerVariant?: "sidebar" | "rail"
}) {
  const [open, setOpen] = useState(false)
  const [shares, setShares] = useState<CalendarShare[]>([])
  const [name, setName] = useState("My calendar")
  const [view, setView] = useState<CalendarShareView>("week")
  const [showEventNames, setShowEventNames] = useState(false)
  const [startDate, setStartDate] = useState(() => dateInput())
  const [endDate, setEndDate] = useState(() => dateInput(29))
  const [visibleWeekdays, setVisibleWeekdays] =
    useState<CalendarShareWeekday[]>(ALL_WEEKDAYS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const copiedTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const loadShares = () => {
    setLoading(true)
    setError(null)
    sharesApi
      .listCalendarShares()
      .then(setShares)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Could not load links")
      )
      .finally(() => setLoading(false))
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) loadShares()
  }

  const createShare = async () => {
    setSaving(true)
    setError(null)
    try {
      const created = await sharesApi.createCalendarShare({
        name,
        view,
        showEventNames,
        startDate,
        endDate,
        visibleWeekdays,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      setShares((current) => [created, ...current])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create link")
    } finally {
      setSaving(false)
    }
  }

  const updateShare = async (
    share: CalendarShare,
    updates: Partial<
      Pick<
        CalendarShare,
        "showEventNames" | "active" | "startDate" | "endDate" | "visibleWeekdays"
      >
    >
  ) => {
    setError(null)
    try {
      const updated = await sharesApi.updateCalendarShare(share.id, updates)
      setShares((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      )
      setEditingId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update link")
    }
  }

  const deleteShare = async (share: CalendarShare) => {
    setError(null)
    try {
      await sharesApi.deleteCalendarShare(share.id)
      setShares((current) => current.filter((item) => item.id !== share.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete link")
    }
  }

  const copyShare = async (share: CalendarShare) => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/shared/calendar/${share.token}`
    )
    setCopiedId(share.id)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopiedId(null), 1600)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {triggerVariant === "rail" ? (
          <button
            className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Share calendar"
            type="button"
          >
            <Share2Icon aria-hidden="true" className="size-4" />
            <span className="sr-only">Share calendar</span>
          </button>
        ) : (
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            type="button"
          >
            <Share2Icon aria-hidden="true" className="size-4" />
            Share calendar
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share your calendar</DialogTitle>
          <DialogDescription>
            Create a live, read-only link. You control whether event names are visible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border border-border/70 bg-background p-3">
          <Input
            aria-label="Link name"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Link name"
            value={name}
          />
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {VIEWS.map((option) => (
              <button
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                  view === option.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                key={option.value}
                onClick={() => setView(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              First visible day
              <Input
                max={endDate}
                onChange={(event) => setStartDate(event.target.value)}
                type="date"
                value={startDate}
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Last visible day
              <Input
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
                type="date"
                value={endDate}
              />
            </label>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Visible days</p>
            <WeekdayPicker onChange={setVisibleWeekdays} value={visibleWeekdays} />
          </div>
          <button
            className="flex w-full items-center justify-between rounded-lg border border-border/70 px-3 py-2 text-left"
            onClick={() => setShowEventNames((current) => !current)}
            type="button"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {showEventNames ? (
                <EyeIcon className="size-4 text-emerald-600" />
              ) : (
                <EyeOffIcon className="size-4 text-muted-foreground" />
              )}
              Event names
            </span>
            <span className="text-xs text-muted-foreground">
              {showEventNames ? "Visible" : "Shown as Blocked"}
            </span>
          </button>
          <Button
            className="w-full"
            disabled={
              saving || !name.trim() || !startDate || !endDate || endDate < startDate
            }
            onClick={() => void createShare()}
          >
            <LinkIcon />
            {saving ? "Creating…" : "Create link"}
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Your links</h3>
            {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
          </div>
          {!loading && shares.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No shared calendars yet.
            </p>
          )}
          {shares.map((share) => (
            <div
              className="overflow-hidden rounded-lg border border-border/70 bg-background"
              key={share.id}
            >
              <div className="flex items-center gap-2 p-3">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg",
                    share.active
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <LinkIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{share.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {share.startDate} – {share.endDate} · {share.visibleWeekdays.length} days/week
                  </p>
                </div>
                <Button
                  aria-label="Edit visible dates"
                  onClick={() =>
                    setEditingId((current) => (current === share.id ? null : share.id))
                  }
                  size="icon-sm"
                  variant="ghost"
                >
                  <CalendarRangeIcon />
                </Button>
                <Button
                  aria-label={share.showEventNames ? "Hide event names" : "Show event names"}
                  onClick={() =>
                    void updateShare(share, { showEventNames: !share.showEventNames })
                  }
                  size="icon-sm"
                  variant="ghost"
                >
                  {share.showEventNames ? <EyeIcon /> : <EyeOffIcon />}
                </Button>
                <Button
                  aria-label={share.active ? "Pause link" : "Resume link"}
                  onClick={() => void updateShare(share, { active: !share.active })}
                  size="icon-sm"
                  variant="ghost"
                >
                  {share.active ? <PauseIcon /> : <PlayIcon />}
                </Button>
                <Button
                  aria-label="Copy link"
                  disabled={!share.active}
                  onClick={() => void copyShare(share)}
                  size="icon-sm"
                  variant="ghost"
                >
                  {copiedId === share.id ? <CheckIcon /> : <CopyIcon />}
                </Button>
                <Button
                  aria-label="Delete link"
                  onClick={() => void deleteShare(share)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
              </div>
              {editingId === share.id && (
                <ShareLimitsEditor
                  onSave={(updates) => updateShare(share, updates)}
                  share={share}
                />
              )}
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}