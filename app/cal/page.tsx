"use client"

import {
  addDays,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { useCallback, useEffect, useMemo, useState } from "react"

import { CalSidebar, eventsOnDay } from "@/components/cal/cal-sidebar"
import { CalendarHeader } from "@/components/cal/calendar-header"
import { CopilotPanel } from "@/components/cal/copilot-panel"
import { toContextEvent, type ContextEvent } from "@/components/cal/cal-agent"
import { AgendaDaysToShow } from "@/components/event-calendar/constants"
import { CalendarDndProvider } from "@/components/event-calendar/calendar-dnd-context"
import { EventCalendar } from "@/components/event-calendar"
import type {
  CalendarEvent,
  CalendarView,
  RecurrenceScope,
} from "@/components/event-calendar/types"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/loading-screen"
import type { AgentEvent } from "@/lib/cal-agent/tools"
import { useEvents } from "@/hooks/use-events"
import { useRecentEvents } from "@/hooks/use-recent-events"

export default function CalPage() {
  const [view, setView] = useState<CalendarView>("week")
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false)
  const [externalSelectedEvent, setExternalSelectedEvent] =
    useState<CalendarEvent | null>(null)
  const [pendingEventId, setPendingEventId] = useState<string | null>(null)
  const [contextEvents, setContextEvents] = useState<ContextEvent[]>([])
  const { recentEvents, record: recordRecentEvent } = useRecentEvents()

  // The window of events to keep synced with Google, padded a week on each side
  // so events bleeding past the visible edges still load.
  const { rangeStart, rangeEnd } = useMemo(() => {
    let start: Date
    let end: Date
    switch (view) {
      case "month":
        start = startOfMonth(currentDate)
        end = endOfMonth(currentDate)
        break
      case "week":
        start = startOfWeek(currentDate)
        end = endOfWeek(currentDate)
        break
      case "day":
        start = startOfDay(currentDate)
        end = startOfDay(addDays(currentDate, 1))
        break
      case "agenda":
        start = startOfDay(currentDate)
        end = startOfDay(addDays(currentDate, AgendaDaysToShow))
        break
    }
    return { rangeStart: addDays(start, -7), rangeEnd: addDays(end, 7) }
  }, [view, currentDate])

  const {
    events,
    isConnected,
    isLoading,
    isSyncing,
    refresh,
    addEvent,
    updateEvent,
    deleteEvent,
  } = useEvents({ startDate: rangeStart, endDate: rangeEnd })

  const handleEventAdd = useCallback(
    (event: CalendarEvent) => {
      void addEvent(event)
    },
    [addEvent]
  )

  const handleEventUpdate = useCallback(
    (updated: CalendarEvent, recurrenceScope: RecurrenceScope = "single") => {
      void updateEvent(updated, recurrenceScope)
    },
    [updateEvent]
  )

  const handleEventDelete = useCallback(
    (eventId: string, recurrenceScope: RecurrenceScope = "single") => {
      void deleteEvent(eventId, recurrenceScope)
    },
    [deleteEvent]
  )

  // An event dragged onto the assistant sidebar becomes context for the next
  // message. Resolve to the live event if it's still in the synced window, and
  // dedupe by id.
  const handleAgentDrop = useCallback(
    (event: CalendarEvent) => {
      const live = events.find((e) => e.id === event.id) ?? event
      const ctx = toContextEvent(live)
      setContextEvents((prev) =>
        prev.some((e) => e.id === ctx.id) ? prev : [...prev, ctx]
      )
    },
    [events]
  )

  const removeContextEvent = useCallback((id: string) => {
    setContextEvents((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const clearContextEvents = useCallback(() => setContextEvents([]), [])

  const todayEvents = useMemo(
    () => eventsOnDay(events, new Date()),
    [events]
  )

  const handleOpenEvent = useCallback(
    (event: CalendarEvent) => {
      // Prefer the live event if it's still in the synced window.
      const live = events.find((e) => e.id === event.id) ?? event
      recordRecentEvent(live)
      setExternalSelectedEvent(live)
    },
    [events, recordRecentEvent]
  )

  // The agent returns lightweight events (id + strings); resolve to the live one.
  const handleOpenAgentEvent = useCallback(
    (agentEvent: { id: string; start?: string }) => {
      const live = events.find((e) => e.id === agentEvent.id)
      if (live) {
        setCurrentDate(new Date(live.start))
        recordRecentEvent(live)
        setExternalSelectedEvent(live)
      }
    },
    [events, recordRecentEvent]
  )

  // When the assistant changes the calendar, refresh and jump to the change so
  // it's visible live.
  const handleAgentMutated = useCallback(
    (_action: "create" | "update" | "delete", event?: AgentEvent) => {
      void refresh()
      if (event?.start) {
        const when = new Date(event.start)
        if (!Number.isNaN(when.getTime())) setCurrentDate(when)
      }
    },
    [refresh]
  )

  // Support deep-links from the agent: /cal?event=<id>&date=<iso> jumps the
  // calendar to that date and opens the event once it has synced in.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const date = params.get("date")
    const eventId = params.get("event")
    if (date) {
      const parsed = new Date(date)
      if (!Number.isNaN(parsed.getTime())) setCurrentDate(parsed)
    }
    if (eventId) setPendingEventId(eventId)
    if (date || eventId) {
      // Clean the URL so a refresh doesn't re-trigger the open.
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (!pendingEventId) return
    const live = events.find((e) => e.id === pendingEventId)
    if (live) {
      recordRecentEvent(live)
      setExternalSelectedEvent(live)
      setPendingEventId(null)
    }
  }, [pendingEventId, events, recordRecentEvent])

  return (
    <CalendarDndProvider
      onEventUpdate={handleEventUpdate}
      onEventDropExternal={handleAgentDrop}
    >
      <div className="flex h-svh w-full overflow-hidden bg-muted/40">
        <CalSidebar
          currentDate={currentDate}
          todayEvents={todayEvents}
          recentEvents={recentEvents}
          onDateChange={setCurrentDate}
          onNewEvent={() => setIsEventDialogOpen(true)}
          onOpenEvent={handleOpenEvent}
        />
        <main className="flex min-w-0 flex-1 flex-col p-2 pl-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
            <CalendarHeader
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              view={view}
              onViewChange={setView}
              onNewEvent={() => setIsEventDialogOpen(true)}
              onRefresh={refresh}
              isSyncing={isSyncing}
              isConnected={isConnected}
            />
            <div className="relative min-h-0 flex-1">
              {isLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/60 text-sm text-muted-foreground backdrop-blur-sm">
                  <Spinner />
                  Loading events…
                </div>
              )}
              <EventCalendar
                events={events}
                onEventAdd={handleEventAdd}
                onEventUpdate={handleEventUpdate}
                onEventDelete={handleEventDelete}
                view={view}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
                isEventDialogOpen={isEventDialogOpen}
                onEventDialogOpenChange={setIsEventDialogOpen}
                onEventOpen={recordRecentEvent}
                externalSelectedEvent={externalSelectedEvent}
                onExternalSelectedEventHandled={() =>
                  setExternalSelectedEvent(null)
                }
                canCreateRecurringEvents={isConnected}
                disableDndProvider
              />
            </div>
          </div>
        </main>
        <CopilotPanel
          onOpenEvent={handleOpenAgentEvent}
          onMutated={handleAgentMutated}
          contextEvents={contextEvents}
          onRemoveContextEvent={removeContextEvent}
          onClearContextEvents={clearContextEvents}
        />
        <Toaster />
      </div>
    </CalendarDndProvider>
  )
}
