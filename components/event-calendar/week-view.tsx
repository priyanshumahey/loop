"use client";

import {
  addHours,
  areIntervalsOverlapping,
  differenceInMinutes,
  eachDayOfInterval,
  eachHourOfInterval,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isBefore,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";

import { useCalendarDnd } from "@/components/event-calendar/calendar-dnd-context";
import {
  EndHour,
  StartHour,
} from "@/components/event-calendar/constants";
import { DraggableEvent } from "@/components/event-calendar/draggable-event";
import { DroppableCell } from "@/components/event-calendar/droppable-cell";
import { EventItem } from "@/components/event-calendar/event-item";
import { useCurrentTimeIndicator } from "@/components/event-calendar/hooks/use-current-time-indicator";
import { useScrollToCurrentTime } from "@/components/event-calendar/hooks/use-scroll-to-current-time";
import { ResizableEvent } from "@/components/event-calendar/resizable-event";
import { useSelectionContext } from "@/components/event-calendar/selection-context";
import { useTimeScale } from "@/components/event-calendar/time-scale-context";
import type { CalendarEvent } from "@/components/event-calendar/types";
import { isMultiDayEvent } from "@/components/event-calendar/utils";
import { cn } from "@/lib/utils";

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
  onEventCreate: (startTime: Date) => void;
}

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

export function WeekView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
}: WeekViewProps) {
  const { onEventUpdate } = useCalendarDnd();
  
  const { cellHeight } = useTimeScale();

  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ end: weekEnd, start: weekStart });
  }, [currentDate]);

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 0 }),
    [currentDate],
  );

  const hours = useMemo(() => {
    const dayStart = startOfDay(currentDate);
    return eachHourOfInterval({
      end: addHours(dayStart, EndHour - 1),
      start: addHours(dayStart, StartHour),
    });
  }, [currentDate]);

  const handleEventResize = useCallback(
    (event: CalendarEvent, newStart: Date, newEnd: Date) => {
      if (onEventUpdate) {
        onEventUpdate({
          ...event,
          start: newStart,
          end: newEnd,
        });
      }
    },
    [onEventUpdate]
  );

  const allDayEvents = useMemo(() => {
    return events
      .filter((event) => {
        return event.allDay || isMultiDayEvent(event);
      })
      .filter((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        return days.some(
          (day) =>
            isSameDay(day, eventStart) ||
            isSameDay(day, eventEnd) ||
            (day > eventStart && day < eventEnd),
        );
      });
  }, [events, days]);

  // Process events for each day to calculate positions
  const processedDayEvents = useMemo(() => {
    const result = days.map((day) => {
      const dayEvents = events.filter((event) => {
        if (event.allDay || isMultiDayEvent(event)) return false;

        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        return (
          isSameDay(day, eventStart) ||
          isSameDay(day, eventEnd) ||
          (eventStart < day && eventEnd > day)
        );
      });

      // Sort events by start time and duration
      const sortedEvents = [...dayEvents].sort((a, b) => {
        const aStart = new Date(a.start);
        const bStart = new Date(b.start);
        const aEnd = new Date(a.end);
        const bEnd = new Date(b.end);

        // First sort by start time
        if (aStart < bStart) return -1;
        if (aStart > bStart) return 1;

        // If start times are equal, sort by duration (longer events first)
        const aDuration = differenceInMinutes(aEnd, aStart);
        const bDuration = differenceInMinutes(bEnd, bStart);
        return bDuration - aDuration;
      });

      // Calculate positions for each event
      const positionedEvents: PositionedEvent[] = [];
      const dayStart = startOfDay(day);

      // Track columns for overlapping events
      const columns: { event: CalendarEvent; end: Date }[][] = [];

      for (const event of sortedEvents) {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        // Adjust start and end times if they're outside this day
        const adjustedStart = isSameDay(day, eventStart)
          ? eventStart
          : dayStart;
        const adjustedEnd = isSameDay(day, eventEnd)
          ? eventEnd
          : addHours(dayStart, 24);

        // Calculate top position and height
        const startHour =
          getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
        const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;

        // Adjust the top calculation to account for the new start time
        const top = (startHour - StartHour) * cellHeight;
        const height = (endHour - startHour) * cellHeight;

        // Find a column for this event
        let columnIndex = 0;
        let placed = false;

        while (!placed) {
          const col = columns[columnIndex] || [];
          if (col.length === 0) {
            columns[columnIndex] = col;
            placed = true;
          } else {
            const overlaps = col.some((c) =>
              areIntervalsOverlapping(
                { end: adjustedEnd, start: adjustedStart },
                {
                  end: new Date(c.event.end),
                  start: new Date(c.event.start),
                },
              ),
            );

            if (!overlaps) {
              placed = true;
            } else {
              columnIndex++;
            }
          }
        }

        // Ensure column is initialized before pushing
        const currentColumn = columns[columnIndex] || [];
        columns[columnIndex] = currentColumn;
        currentColumn.push({ end: adjustedEnd, event });

        // Calculate width and left position based on number of columns
        const width = columnIndex === 0 ? 1 : 0.9;
        const left = columnIndex === 0 ? 0 : columnIndex * 0.1;

        positionedEvents.push({
          event,
          height,
          left,
          top,
          width,
          zIndex: 10 + columnIndex, // Higher columns get higher z-index
        });
      }

      return positionedEvents;
    });

    return result;
  }, [days, events, cellHeight]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  // Get selection context for drag-to-create
  const {
    isSelecting,
    startSelection,
    updateSelection,
    endSelection,
  } = useSelectionContext();

  // Handle mouse events for drag-to-select
  const handleCellMouseDown = useCallback(
    (day: Date, time: number, e: React.MouseEvent) => {
      // Only start selection on left click
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-event]")) return;

      e.preventDefault();
      startSelection(day, time);
    },
    [startSelection]
  );

  const handleCellMouseEnter = useCallback(
    (day: Date, time: number) => {
      if (isSelecting) {
        updateSelection(day, time);
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

  const showAllDaySection = allDayEvents.length > 0;
  const { currentTimePosition, currentTimeVisible } = useCurrentTimeIndicator(
    currentDate,
    "week",
  );
  const scrollContainerRef = useScrollToCurrentTime(currentDate, "week");

  return (
    <div className="flex flex-col h-full overflow-hidden" data-slot="week-view">
      <div
        className="flex-1 overflow-auto overscroll-none"
        ref={scrollContainerRef}
      >
        {/* Sticky header with dates */}
        <div className="sticky top-0 z-30 grid grid-cols-8 border-border/70 border-b bg-background">
          <div className="py-2 text-center text-xs sm:text-sm text-on-surface-variant">
            <span className="max-[479px]:sr-only">{format(new Date(), "O")}</span>
          </div>
          {days.map((day) => (
            <div
              className="py-2 text-center text-xs sm:text-sm text-on-surface-variant data-today:font-semibold data-today:text-sky-600 dark:data-today:text-sky-400"
              data-today={isToday(day) || undefined}
              key={day.toString()}
            >
              <span aria-hidden="true" className="sm:hidden">
                {format(day, "E")[0]}{" "}
                <span className="inline-flex size-5 sm:size-6 items-center justify-center rounded-full text-xs data-today:bg-sky-500 data-today:text-white" data-today={isToday(day) || undefined}>
                  {format(day, "d")}
                </span>
              </span>
              <span className="max-sm:hidden">
                {format(day, "EEE")}{" "}
                <span className="inline-flex size-6 items-center justify-center rounded-full data-today:bg-sky-500 data-today:text-white" data-today={isToday(day) || undefined}>
                  {format(day, "dd")}
                </span>
              </span>
            </div>
          ))}
        </div>

        {showAllDaySection && (
          <div className="sticky top-[41px] z-30 border-border/70 border-b bg-muted/50">
            <div className="grid grid-cols-8">
              <div className="relative border-border/70 border-r">
                <span className="absolute bottom-0 left-0 h-6 w-16 max-w-full pe-2 text-right text-xs text-on-surface-variant sm:pe-4">
                  All day
                </span>
              </div>
              {days.map((day, dayIndex) => {
                const dayAllDayEvents = allDayEvents.filter((event) => {
                  const eventStart = new Date(event.start);
                  const eventEnd = new Date(event.end);
                  return (
                    isSameDay(day, eventStart) ||
                    (day > eventStart && day < eventEnd) ||
                    isSameDay(day, eventEnd)
                  );
                });

                return (
                  <div
                    className="relative border-border/70 border-r p-1 last:border-r-0"
                    data-today={isToday(day) || undefined}
                    key={day.toString()}
                  >
                    {dayAllDayEvents.map((event) => {
                      const eventStart = new Date(event.start);
                      const eventEnd = new Date(event.end);
                      const isFirstDay = isSameDay(day, eventStart);
                      const isLastDay = isSameDay(day, eventEnd);

                      // Check if this is the first day in the current week view
                      const isFirstVisibleDay =
                        dayIndex === 0 && isBefore(eventStart, weekStart);
                      const shouldShowTitle = isFirstDay || isFirstVisibleDay;

                      return (
                        <EventItem
                          event={event}
                          isFirstDay={isFirstDay}
                          isLastDay={isLastDay}
                          key={`spanning-${event.id}`}
                          onClick={(e) => handleEventClick(event, e)}
                          view="month"
                        >
                          {/* Show title if it's the first day of the event or the first visible day in the week */}
                          <div
                            aria-hidden={!shouldShowTitle}
                            className={cn(
                              "truncate",
                              !shouldShowTitle && "invisible",
                            )}
                          >
                            {event.title}
                          </div>
                        </EventItem>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-8" style={{ minHeight: '600px' }}>
          <div className="grid auto-cols-fr border-border/70 border-r">
            {hours.map((hour, index) => (
              <div
                className="relative min-h-[var(--week-cells-height)] border-border/70 border-b last:border-b-0"
                key={hour.toString()}
              >
                {index > 0 && (
                  <span className="-top-3 absolute left-0 flex h-6 w-16 max-w-full items-center justify-end bg-background pe-2 text-xs text-on-surface-variant sm:pe-4">
                    {format(hour, "h a")}
                  </span>
                )}
              </div>
            ))}
          </div>

          {days.map((day, dayIndex) => (
            <div
              className={cn(
                "relative grid auto-cols-fr border-border/70 border-r last:border-r-0",
                isToday(day) && "bg-sky-100/50 dark:bg-sky-900/20"
              )}
              data-today={isToday(day) || undefined}
              key={day.toString()}
            >
              {/* Positioned events */}
              {(processedDayEvents[dayIndex] ?? []).map((positionedEvent) => (
                <div
                  className="absolute z-10 px-0.5"
                  key={positionedEvent.event.id}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    height: `${positionedEvent.height}px`,
                    left: `${positionedEvent.left * 100}%`,
                    top: `${positionedEvent.top}px`,
                    width: `${positionedEvent.width * 100}%`,
                    zIndex: positionedEvent.zIndex,
                  }}
                >
                  <ResizableEvent
                    event={positionedEvent.event}
                    onResize={handleEventResize}
                  >
                    <DraggableEvent
                      event={positionedEvent.event}
                      height={positionedEvent.height}
                      onClick={(e) => handleEventClick(positionedEvent.event, e)}
                      showTime
                      view="week"
                    />
                  </ResizableEvent>
                </div>
              ))}

              {/* Current time indicator - only show for today's column */}
              {currentTimeVisible && isToday(day) && (
                <div
                  className="pointer-events-none absolute right-0 left-0 z-20"
                  style={{ top: `${currentTimePosition}%` }}
                >
                  <div className="relative flex items-center">
                    <div className="-left-1 absolute h-2 w-2 rounded-full bg-primary" />
                    <div className="h-[2px] w-full bg-primary" />
                  </div>
                </div>
              )}
              {hours.map((hour) => {
                const hourValue = getHours(hour);
                return (
                  <div
                    className="relative min-h-[var(--week-cells-height)] border-border/70 border-b last:border-b-0"
                    key={hour.toString()}
                  >
                    {/* Quarter-hour intervals */}
                    {[0, 1, 2, 3].map((quarter) => {
                      const quarterHourTime = hourValue + quarter * 0.25;
                      return (
                        <DroppableCell
                          className={cn(
                            "absolute h-[calc(var(--week-cells-height)/4)] w-full",
                            quarter === 0 && "top-0",
                            quarter === 1 &&
                            "top-[calc(var(--week-cells-height)/4)]",
                            quarter === 2 &&
                            "top-[calc(var(--week-cells-height)/4*2)]",
                            quarter === 3 &&
                            "top-[calc(var(--week-cells-height)/4*3)]",
                          )}
                          date={day}
                          id={`week-cell-${day.toISOString()}-${quarterHourTime}`}
                          key={`${hour.toString()}-${quarter}`}
                          onClick={() => {
                            if (!isSelecting) {
                              const startTime = new Date(day);
                              startTime.setHours(hourValue);
                              startTime.setMinutes(quarter * 15);
                              onEventCreate(startTime);
                            }
                          }}
                          onMouseDown={(e) => handleCellMouseDown(day, quarterHourTime, e)}
                          onMouseEnter={() => handleCellMouseEnter(day, quarterHourTime)}
                          onMouseUp={handleMouseUp}
                          time={quarterHourTime}
                        />
                      );
                    })}
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
