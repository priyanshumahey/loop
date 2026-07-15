"use client";

import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DefaultStartHour,
  EventGap,
  EventHeight,
} from "@/components/event-calendar/constants";
import { DraggableEvent } from "@/components/event-calendar/draggable-event";
import { DroppableCell } from "@/components/event-calendar/droppable-cell";
import { EventItem } from "@/components/event-calendar/event-item";
import { useEventVisibility } from "@/components/event-calendar/hooks/use-event-visibility";
import { useSelectionContext } from "@/components/event-calendar/selection-context";
import type { CalendarEvent } from "@/components/event-calendar/types";
import {
  getAllEventsForDay,
  getEventsForDay,
  getSpanningEventsForDay,
  sortEvents,
} from "@/components/event-calendar/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
}

export function MonthView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
}: MonthViewProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ end: calendarEnd, start: calendarStart });
  }, [currentDate]);

  const weekdays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(startOfWeek(new Date()), i);
      return format(date, "EEE");
    });
  }, []);

  const weeks = useMemo(() => {
    const result = [];
    let week = [];

    for (let i = 0; i < days.length; i++) {
      week.push(days[i]);
      if (week.length === 7 || i === days.length - 1) {
        result.push(week);
        week = [];
      }
    }

    return result;
  }, [days]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const [isMounted, setIsMounted] = useState(false);
  const { contentRef, getVisibleEventCount } = useEventVisibility({
    eventGap: EventGap,
    eventHeight: EventHeight,
  });

  const {
    isSelecting,
    startSelection,
    updateSelection,
    endSelection,
    isDateInSelection,
  } = useSelectionContext();

  // Handle mouse events for drag-to-select
  const handleMouseDown = useCallback(
    (day: Date, e: React.MouseEvent) => {
      // Only start selection on left click and not on events
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-event]")) return;

      e.preventDefault();
      startSelection(day);
    },
    [startSelection]
  );

  const handleMouseEnter = useCallback(
    (day: Date) => {
      if (isSelecting) {
        updateSelection(day);
      }
    },
    [isSelecting, updateSelection]
  );

  const handleMouseUp = useCallback(() => {
    if (isSelecting) {
      endSelection();
    }
  }, [isSelecting, endSelection]);

  // Add global mouse up listener for ending selection
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting) {
        endSelection();
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [isSelecting, endSelection]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden" data-slot="month-view">
      <div className="flex-1 overflow-auto overscroll-none">
        {/* Sticky weekday header */}
        <div className="sticky top-0 z-30 grid grid-cols-7 border-border/70 border-b bg-background">
          {weekdays.map((day) => (
            <div
              className="py-2 text-center text-xs sm:text-sm text-on-surface-variant font-medium"
              key={day}
            >
              <span className="sm:hidden">{day.charAt(0)}</span>
              <span className="hidden sm:inline">{day}</span>
            </div>
          ))}
        </div>
        <div className="grid auto-rows-fr" style={{ minHeight: '500px' }}>
          {weeks.map((week, weekIndex) => (
            <div
              className="grid grid-cols-7 [&:last-child>*]:border-b-0"
              key={`week-${week}`}
            >
              {week.map((day, dayIndex) => {
                if (!day) return null; // Skip if day is undefined

                const dayEvents = getEventsForDay(events, day);
                const spanningEvents = getSpanningEventsForDay(events, day);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const cellId = `month-cell-${day.toISOString()}`;
                const allDayEvents = [...spanningEvents, ...dayEvents];
                const allEvents = getAllEventsForDay(events, day);

                const isReferenceCell = weekIndex === 0 && dayIndex === 0;
                const visibleCount = isMounted
                  ? getVisibleEventCount(allDayEvents.length)
                  : undefined;
                const hasMore =
                  visibleCount !== undefined &&
                  allDayEvents.length > visibleCount;
                const remainingCount = hasMore
                  ? allDayEvents.length - visibleCount
                  : 0;

                return (
                  <div
                    className={cn(
                      "group border-border/70 border-r border-b last:border-r-0 data-outside-cell:bg-muted/25 data-outside-cell:text-muted-foreground/70",
                      isDateInSelection(day) && "bg-sky-500/20",
                      isToday(day) && !isDateInSelection(day) && "bg-sky-100/50 dark:bg-sky-900/20"
                    )}
                    data-outside-cell={!isCurrentMonth || undefined}
                    data-today={isToday(day) || undefined}
                    key={day.toString()}
                    onMouseDown={(e) => handleMouseDown(day, e)}
                    onMouseEnter={() => handleMouseEnter(day)}
                    onMouseUp={handleMouseUp}
                  >
                    <DroppableCell
                      date={day}
                      id={cellId}
                      onClick={() => {
                        // Only trigger click if not selecting
                        if (!isSelecting) {
                          const startTime = new Date(day);
                          startTime.setHours(DefaultStartHour, 0, 0);
                          onEventCreate(startTime);
                        }
                      }}
                    >
                      <div className="mt-1 inline-flex size-7 items-center justify-center rounded-full text-sm font-medium text-on-surface group-data-today:bg-sky-500 group-data-today:text-white group-data-today:shadow-sm">
                        {format(day, "d")}
                      </div>
                      <div
                        className="min-h-[calc((var(--event-height)+var(--event-gap))*2)] sm:min-h-[calc((var(--event-height)+var(--event-gap))*3)] lg:min-h-[calc((var(--event-height)+var(--event-gap))*4)]"
                        ref={isReferenceCell ? contentRef : null}
                      >
                        {sortEvents(allDayEvents).map((event, index) => {
                          const eventStart = new Date(event.start);
                          const eventEnd = new Date(event.end);
                          const isFirstDay = isSameDay(day, eventStart);
                          const isLastDay = isSameDay(day, eventEnd);

                          const isHidden =
                            isMounted && visibleCount && index >= visibleCount;

                          if (!visibleCount) return null;

                          if (!isFirstDay) {
                            return (
                              <div
                                aria-hidden={isHidden ? "true" : undefined}
                                className="aria-hidden:hidden"
                                key={`spanning-${event.id}-${day.toISOString().slice(0, 10)}`}
                              >
                                <EventItem
                                  event={event}
                                  isFirstDay={isFirstDay}
                                  isLastDay={isLastDay}
                                  onClick={(e) => handleEventClick(event, e)}
                                  view="month"
                                >
                                  <div aria-hidden={true} className="invisible">
                                    {!event.allDay && (
                                      <span>
                                        {format(
                                          new Date(event.start),
                                          "h:mm",
                                        )}{" "}
                                      </span>
                                    )}
                                    {event.title}
                                  </div>
                                </EventItem>
                              </div>
                            );
                          }

                          return (
                            <div
                              aria-hidden={isHidden ? "true" : undefined}
                              className="aria-hidden:hidden"
                              key={event.id}
                            >
                              <DraggableEvent
                                event={event}
                                isFirstDay={isFirstDay}
                                isLastDay={isLastDay}
                                onClick={(e) => handleEventClick(event, e)}
                                view="month"
                              />
                            </div>
                          );
                        })}

                        {hasMore && (
                          <Popover modal>
                            <PopoverTrigger asChild>
                              <button
                                className="mt-[var(--event-gap)] flex h-[var(--event-height)] w-full select-none items-center overflow-hidden px-1 text-left text-xs text-on-surface-variant outline-none backdrop-blur-md transition hover:bg-muted/50 hover:text-on-surface focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-2"
                                onClick={(e) => e.stopPropagation()}
                                type="button"
                              >
                                <span>
                                  + {remainingCount}{" "}
                                  <span className="max-sm:sr-only">more</span>
                                </span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="center"
                              className="max-w-52 p-3"
                              style={
                                {
                                  "--event-height": `${EventHeight}px`,
                                } as Record<string, string>
                              }
                            >
                              <div className="space-y-2">
                                <div className="text-sm font-medium text-on-surface">
                                  {format(day, "EEE d")}
                                </div>
                                <div className="space-y-1">
                                  {sortEvents(allEvents).map((event) => {
                                    const eventStart = new Date(event.start);
                                    const eventEnd = new Date(event.end);
                                    const isFirstDay = isSameDay(day, eventStart);
                                    const isLastDay = isSameDay(day, eventEnd);

                                    return (
                                      <EventItem
                                        event={event}
                                        isFirstDay={isFirstDay}
                                        isLastDay={isLastDay}
                                        key={event.id}
                                        onClick={(e) =>
                                          handleEventClick(event, e)
                                        }
                                        view="month"
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </DroppableCell>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
