"use client";

import {
  addHours,
  areIntervalsOverlapping,
  differenceInMinutes,
  eachHourOfInterval,
  format,
  getHours,
  getMinutes,
  isSameDay,
  isToday,
  startOfDay,
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

interface DayViewProps {
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

export function DayView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate,
}: DayViewProps) {
  const { onEventUpdate } = useCalendarDnd();
  
  const { cellHeight } = useTimeScale();

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

  const dayEvents = useMemo(() => {
    return events
      .filter((event) => {
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        return (
          isSameDay(currentDate, eventStart) ||
          isSameDay(currentDate, eventEnd) ||
          (currentDate > eventStart && currentDate < eventEnd)
        );
      })
      .sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
  }, [currentDate, events]);

  const allDayEvents = useMemo(() => {
    return dayEvents.filter((event) => {
      return event.allDay || isMultiDayEvent(event);
    });
  }, [dayEvents]);

  const timeEvents = useMemo(() => {
    return dayEvents.filter((event) => {
      return !event.allDay && !isMultiDayEvent(event);
    });
  }, [dayEvents]);

  // Process events to calculate positions
  const positionedEvents = useMemo(() => {
    const result: PositionedEvent[] = [];
    const dayStart = startOfDay(currentDate);

    // Sort events by start time and duration
    const sortedEvents = [...timeEvents].sort((a, b) => {
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

    // Track columns for overlapping events
    const columns: { event: CalendarEvent; end: Date }[][] = [];

    for (const event of sortedEvents) {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);

      // Adjust start and end times if they're outside this day
      const adjustedStart = isSameDay(currentDate, eventStart)
        ? eventStart
        : dayStart;
      const adjustedEnd = isSameDay(currentDate, eventEnd)
        ? eventEnd
        : addHours(dayStart, 24);

      // Calculate top position and height
      const startHour =
        getHours(adjustedStart) + getMinutes(adjustedStart) / 60;
      const endHour = getHours(adjustedEnd) + getMinutes(adjustedEnd) / 60;

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
              { end: new Date(c.event.end), start: new Date(c.event.start) },
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

      // First column takes full width, others are indented by 10% and take 90% width
      const width = columnIndex === 0 ? 1 : 0.9;
      const left = columnIndex === 0 ? 0 : columnIndex * 0.1;

      result.push({
        event,
        height,
        left,
        top,
        width,
        zIndex: 10 + columnIndex,
      });
    }

    return result;
  }, [currentDate, timeEvents, cellHeight]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const {
    isSelecting,
    startSelection,
    updateSelection,
    endSelection,
  } = useSelectionContext();

  // Handle mouse events for drag-to-select
  const handleCellMouseDown = useCallback(
    (time: number, e: React.MouseEvent) => {
      // Only start selection on left click
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-event]")) return;

      e.preventDefault();
      startSelection(currentDate, time);
    },
    [startSelection, currentDate]
  );

  const handleCellMouseEnter = useCallback(
    (time: number) => {
      if (isSelecting) {
        updateSelection(currentDate, time);
      }
    },
    [isSelecting, updateSelection, currentDate]
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
    "day",
  );
  const scrollContainerRef = useScrollToCurrentTime(currentDate, "day");

  return (
    <div className="flex flex-col h-full overflow-hidden" data-slot="day-view">
      <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
        {/* Sticky all-day section */}
        {showAllDaySection && (
          <div className="sticky top-0 z-30 border-border/70 border-t bg-background">
            <div className="grid grid-cols-[3rem_1fr] sm:grid-cols-[4rem_1fr]">
              <div className="relative">
                <span className="absolute bottom-0 left-0 h-6 w-16 max-w-full pe-2 text-right text-xs text-on-surface-variant sm:pe-4">
                  All day
                </span>
              </div>
              <div className="relative border-border/70 border-r p-1 last:border-r-0">
                {allDayEvents.map((event) => {
                  const eventStart = new Date(event.start);
                  const eventEnd = new Date(event.end);
                  const isFirstDay = isSameDay(currentDate, eventStart);
                  const isLastDay = isSameDay(currentDate, eventEnd);

                  return (
                    <EventItem
                      event={event}
                      isFirstDay={isFirstDay}
                      isLastDay={isLastDay}
                      key={`spanning-${event.id}`}
                      onClick={(e) => handleEventClick(event, e)}
                      view="month"
                    >
                      {/* Always show the title in day view for better usability */}
                      <div>{event.title}</div>
                    </EventItem>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-[3rem_1fr] border-border/70 border-t sm:grid-cols-[4rem_1fr]" style={{ minHeight: '600px' }}>
          <div>
            {hours.map((hour, index) => (
              <div
                className="relative h-[var(--week-cells-height)] border-border/70 border-b last:border-b-0"
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

          <div className={cn(
            "relative",
            isToday(currentDate) && "bg-sky-100/50 dark:bg-sky-900/20"
          )}>
            {/* Positioned events */}
            {positionedEvents.map((positionedEvent) => (
              <div
                className="absolute z-10 px-0.5"
                key={positionedEvent.event.id}
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
                    view="day"
                  />
                </ResizableEvent>
              </div>
            ))}

            {/* Current time indicator */}
            {currentTimeVisible && (
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

            {/* Time grid */}
            {hours.map((hour) => {
              const hourValue = getHours(hour);
              return (
                <div
                  className="relative h-[var(--week-cells-height)] border-border/70 border-b last:border-b-0"
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
                        date={currentDate}
                        id={`day-cell-${currentDate.toISOString()}-${quarterHourTime}`}
                        key={`${hour.toString()}-${quarter}`}
                        onClick={() => {
                          if (!isSelecting) {
                            const startTime = new Date(currentDate);
                            startTime.setHours(hourValue);
                            startTime.setMinutes(quarter * 15);
                            onEventCreate(startTime);
                          }
                        }}
                        onMouseDown={(e) => handleCellMouseDown(quarterHourTime, e)}
                        onMouseEnter={() => handleCellMouseEnter(quarterHourTime)}
                        onMouseUp={handleMouseUp}
                        time={quarterHourTime}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
