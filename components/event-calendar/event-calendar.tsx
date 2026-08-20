"use client";

import { useCallback, useEffect, useState } from "react";

import { AgendaView } from "@/components/event-calendar/agenda-view";
import { CalendarDndProvider } from "@/components/event-calendar/calendar-dnd-context";
import {
  EventGap,
  EventHeight,
} from "@/components/event-calendar/constants";
import { DayView } from "@/components/event-calendar/day-view";
import { EventDialog } from "@/components/event-calendar/event-dialog";
import { MonthView } from "@/components/event-calendar/month-view";
import {
  SelectionProvider,
  type DateTimeSelection,
} from "@/components/event-calendar/selection-context";
import {
  TimeScaleProvider,
  useTimeScale,
} from "@/components/event-calendar/time-scale-context";
import type {
  CalendarEvent,
  CalendarView,
  RecurrenceScope,
} from "@/components/event-calendar/types";
import { addHoursToDate } from "@/components/event-calendar/utils";
import { WeekView } from "@/components/event-calendar/week-view";
import { cn } from "@/lib/utils";

export interface EventCalendarProps {
  events?: CalendarEvent[];
  onEventAdd?: (event: CalendarEvent) => void;
  onEventUpdate?: (event: CalendarEvent, recurrenceScope?: RecurrenceScope) => void;
  onEventDelete?: (eventId: string, recurrenceScope?: RecurrenceScope) => void;
  className?: string;
  view?: CalendarView;
  currentDate?: Date;
  onDateChange?: (date: Date) => void;
  isEventDialogOpen?: boolean;
  onEventDialogOpenChange?: (open: boolean) => void;
  /** Externally controlled selected event (e.g., from copilot) */
  externalSelectedEvent?: CalendarEvent | null;
  /** Callback to clear the external selection after it's been handled */
  onExternalSelectedEventHandled?: () => void;
  /** Fired whenever an existing event is opened (via click or externally). */
  onEventOpen?: (event: CalendarEvent) => void;
  canCreateRecurringEvents?: boolean;
  /**
   * Skip mounting the internal drag-and-drop provider, relying on a parent
   * `CalendarDndProvider` instead. Use this when events must be draggable into
   * targets that live outside the calendar (e.g. the assistant sidebar).
   */
  disableDndProvider?: boolean;
}

export function EventCalendar({
  events = [],
  onEventAdd,
  onEventUpdate,
  onEventDelete,
  className,
  view = "month",
  currentDate: controlledDate,
  onDateChange,
  isEventDialogOpen: controlledDialogOpen,
  onEventDialogOpenChange,
  externalSelectedEvent,
  onExternalSelectedEventHandled,
  onEventOpen,
  canCreateRecurringEvents = true,
  disableDndProvider = false,
}: EventCalendarProps) {
  const [internalDate, setInternalDate] = useState(new Date());
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);

  // Use controlled date if provided, otherwise use internal state
  const currentDate = controlledDate ?? internalDate;
  const isEventDialogOpen = controlledDialogOpen ?? internalDialogOpen;

  const setIsEventDialogOpen = useCallback((open: boolean) => {
    if (onEventDialogOpenChange) {
      onEventDialogOpenChange(open);
    } else {
      setInternalDialogOpen(open);
    }
  }, [onEventDialogOpenChange]);

  const setCurrentDate = useCallback((dateOrUpdater: Date | ((prev: Date) => Date)) => {
    if (typeof dateOrUpdater === "function") {
      // For functional updates, we need the current value
      if (onDateChange) {
        // When controlled, use controlledDate for the functional update
        onDateChange(dateOrUpdater(controlledDate ?? new Date()));
      } else {
        setInternalDate(dateOrUpdater);
      }
    } else {
      if (onDateChange) {
        onDateChange(dateOrUpdater);
      } else {
        setInternalDate(dateOrUpdater);
      }
    }
  }, [controlledDate, onDateChange]);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );

  // Keyboard shortcut for going to today
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input, textarea or contentEditable element
      // or if the event dialog is open
      if (
        isEventDialogOpen ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case "t":
        case "T":
          // Press T to go to today
          setCurrentDate(new Date());
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEventDialogOpen, setCurrentDate]);

  // Handle external event selection (e.g., from copilot)
  useEffect(() => {
    if (externalSelectedEvent) {
      setSelectedEvent(externalSelectedEvent);
      setIsEventDialogOpen(true);
      // Clear the external selection after handling
      onExternalSelectedEventHandled?.();
    }
  }, [externalSelectedEvent, onExternalSelectedEventHandled, setIsEventDialogOpen]);

  const handleEventSelect = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsEventDialogOpen(true);
    onEventOpen?.(event);
  };

  const handleEventCreate = (startTime: Date) => {
    // Snap to 15-minute intervals
    const minutes = startTime.getMinutes();
    const remainder = minutes % 15;
    if (remainder !== 0) {
      if (remainder < 7.5) {
        // Round down to nearest 15 min
        startTime.setMinutes(minutes - remainder);
      } else {
        // Round up to nearest 15 min
        startTime.setMinutes(minutes + (15 - remainder));
      }
      startTime.setSeconds(0);
      startTime.setMilliseconds(0);
    }

    const newEvent: CalendarEvent = {
      allDay: false,
      end: addHoursToDate(startTime, 1),
      id: "",
      start: startTime,
      title: "",
    };
    setSelectedEvent(newEvent);
    setIsEventDialogOpen(true);
  };

  // Handle drag-to-select date range event creation
  const handleSelectionComplete = (selection: DateTimeSelection) => {
    if (!selection.start || !selection.end) return;

    // Check if it's an all-day selection (dates without specific times)
    const startHours = selection.start.getHours();
    const endHours = selection.end.getHours();
    const isAllDay =
      (startHours === 0 && endHours === 23) ||
      (selection.start.getDate() !== selection.end.getDate() &&
        startHours === 0 &&
        selection.end.getMinutes() === 59);

    const newEvent: CalendarEvent = {
      allDay: isAllDay,
      end: selection.end,
      id: "",
      start: selection.start,
      title: "",
    };
    setSelectedEvent(newEvent);
    setIsEventDialogOpen(true);
  };

  const handleEventSave = (
    event: CalendarEvent,
    recurrenceScope: RecurrenceScope,
  ) => {
    if (event.id) {
      onEventUpdate?.(event, recurrenceScope);
    } else {
      onEventAdd?.({
        ...event,
        id: Math.random().toString(36).substring(2, 11),
      });
    }
    setIsEventDialogOpen(false);
    setSelectedEvent(null);
  };

  const handleEventDelete = (
    eventId: string,
    recurrenceScope: RecurrenceScope,
  ) => {
    onEventDelete?.(eventId, recurrenceScope);
    setIsEventDialogOpen(false);
    setSelectedEvent(null);
  };

  const handleEventUpdate = (updatedEvent: CalendarEvent) => {
    onEventUpdate?.(updatedEvent);
  };

  return (
    <TimeScaleProvider>
      <CalendarContent
        className={className}
        view={view}
        currentDate={currentDate}
        events={events}
        selectedEvent={selectedEvent}
        isEventDialogOpen={isEventDialogOpen}
        onEventCreate={handleEventCreate}
        onEventSelect={handleEventSelect}
        onSelectionComplete={handleSelectionComplete}
        onEventUpdate={handleEventUpdate}
        onEventSave={handleEventSave}
        onEventDelete={handleEventDelete}
        onDialogClose={() => {
          setIsEventDialogOpen(false);
          setSelectedEvent(null);
        }}
        canCreateRecurringEvents={canCreateRecurringEvents}
        disableDndProvider={disableDndProvider}
      />
    </TimeScaleProvider>
  );
}

// Inner component that can access TimeScaleContext
function CalendarContent({
  className,
  view,
  currentDate,
  events,
  selectedEvent,
  isEventDialogOpen,
  onEventCreate,
  onEventSelect,
  onSelectionComplete,
  onEventUpdate,
  onEventSave,
  onEventDelete,
  onDialogClose,
  canCreateRecurringEvents,
  disableDndProvider,
}: {
  className?: string;
  view: CalendarView;
  currentDate: Date;
  events: CalendarEvent[];
  selectedEvent: CalendarEvent | null;
  isEventDialogOpen: boolean;
  onEventCreate: (startTime: Date) => void;
  onEventSelect: (event: CalendarEvent) => void;
  onSelectionComplete: (selection: DateTimeSelection) => void;
  onEventUpdate: (event: CalendarEvent) => void;
  onEventSave: (event: CalendarEvent, recurrenceScope: RecurrenceScope) => void;
  onEventDelete: (eventId: string, recurrenceScope: RecurrenceScope) => void;
  onDialogClose: () => void;
  canCreateRecurringEvents: boolean;
  disableDndProvider: boolean;
}) {
  const { cellHeight, zoomContainerRef, zoomPercentage, resetScale } = useTimeScale();

  const content = (
    <>
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
            {view === "month" && (
              <MonthView
                currentDate={currentDate}
                events={events}
                onEventCreate={onEventCreate}
                onEventSelect={onEventSelect}
              />
            )}
            {view === "week" && (
              <div className="flex-1 min-h-0 relative" ref={zoomContainerRef}>
                <WeekView
                  currentDate={currentDate}
                  events={events}
                  onEventCreate={onEventCreate}
                  onEventSelect={onEventSelect}
                />
                {/* Zoom indicator */}
                {zoomPercentage !== 100 && (
                  <button
                    onClick={resetScale}
                    className="absolute bottom-4 left-4 z-50 bg-popover text-popover-foreground shadow-lg rounded-md px-3 py-1.5 text-xs font-medium border border-border hover:bg-accent transition-colors"
                    title="Click to reset zoom"
                  >
                    {zoomPercentage}%
                  </button>
                )}
              </div>
            )}
            {view === "day" && (
              <div className="flex-1 min-h-0 relative" ref={zoomContainerRef}>
                <DayView
                  currentDate={currentDate}
                  events={events}
                  onEventCreate={onEventCreate}
                  onEventSelect={onEventSelect}
                />
                {/* Zoom indicator */}
                {zoomPercentage !== 100 && (
                  <button
                    onClick={resetScale}
                    className="absolute bottom-4 left-4 z-50 bg-popover text-popover-foreground shadow-lg rounded-md px-3 py-1.5 text-xs font-medium border border-border hover:bg-accent transition-colors"
                    title="Click to reset zoom"
                  >
                    {zoomPercentage}%
                  </button>
                )}
              </div>
            )}
            {view === "agenda" && (
              <AgendaView
                currentDate={currentDate}
                events={events}
                onEventSelect={onEventSelect}
              />
            )}
          </div>

          <EventDialog
            event={selectedEvent}
            isOpen={isEventDialogOpen}
            onClose={onDialogClose}
            onDelete={onEventDelete}
            onSave={onEventSave}
            canCreateRecurringEvents={canCreateRecurringEvents}
          />
    </>
  );

  return (
    <div
      className={cn("flex flex-col h-full", className)}
      style={
        {
          "--event-gap": `${EventGap}px`,
          "--event-height": `${EventHeight}px`,
          "--week-cells-height": `${cellHeight}px`,
        } as React.CSSProperties
      }
    >
      <SelectionProvider onSelectionComplete={onSelectionComplete}>
        {disableDndProvider ? (
          content
        ) : (
          <CalendarDndProvider onEventUpdate={onEventUpdate}>
            {content}
          </CalendarDndProvider>
        )}
      </SelectionProvider>
    </div>
  );
}
