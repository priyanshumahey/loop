"use client";

import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { differenceInMinutes, format, getMinutes, isPast } from "date-fns";
import { forwardRef, memo, useMemo } from "react";

import { stripHtml } from "@/components/event-calendar/event-description";
import type { CalendarEvent } from "@/components/event-calendar/types";
import {
  getBorderRadiusClasses,
  getEventColorClasses,
} from "@/components/event-calendar/utils";
import { cn } from "@/lib/utils";

// Using date-fns format with custom formatting:
// 'h' - hours (1-12)
// 'a' - am/pm
// ':mm' - minutes with leading zero (only if the token 'mm' is present)
const formatTimeWithOptionalMinutes = (date: Date) => {
  return format(date, getMinutes(date) === 0 ? "ha" : "h:mma").toLowerCase();
};

interface EventWrapperProps {
  event: CalendarEvent;
  isFirstDay?: boolean;
  isLastDay?: boolean;
  isDragging?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
  currentTime?: Date;
  dndListeners?: SyntheticListenerMap;
  dndAttributes?: DraggableAttributes;
  onMouseDown?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  /** Enable native HTML5 drag for external targets (e.g., copilot input) */
  enableNativeDrag?: boolean;
}

const EventWrapper = forwardRef<
  HTMLButtonElement,
  EventWrapperProps & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "color">
>(
  (
    {
      event,
      isFirstDay = true,
      isLastDay = true,
      isDragging,
      onClick,
      className,
      children,
      currentTime,
      dndListeners,
      dndAttributes,
      onMouseDown,
      onTouchStart,
      enableNativeDrag = true,
      ...triggerProps
    },
    ref,
  ) => {
    // Always use the currentTime (if provided) to determine if the event is in the past
    const displayEnd = currentTime
      ? new Date(
          new Date(currentTime).getTime() +
            (new Date(event.end).getTime() - new Date(event.start).getTime()),
        )
      : new Date(event.end);

    const isEventInPast = isPast(displayEnd);

    // Handle native HTML5 drag for external targets (e.g., copilot input)
    const handleNativeDragStart = (e: React.DragEvent) => {
      const payload = JSON.stringify({ eventIds: [event.id] });
      // Set custom MIME type for direct detection
      e.dataTransfer.setData("application/x-calendar-event-ids", payload);
      // Fallback for browsers that don't expose custom MIME types reliably
      e.dataTransfer.setData("text/plain", `calendar-event-ids:${payload}`);
      e.dataTransfer.effectAllowed = "copy";
    };

    return (
      <button
        ref={ref}
        className={cn(
          "flex size-full select-none overflow-hidden px-1 text-left font-medium outline-none backdrop-blur-md transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-dragging:cursor-grabbing data-past-event:line-through data-dragging:shadow-lg sm:px-2",
          getEventColorClasses(event.color),
          getBorderRadiusClasses(isFirstDay, isLastDay),
          className,
        )}
        data-dragging={isDragging || undefined}
        data-past-event={isEventInPast || undefined}
        {...triggerProps}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        draggable={enableNativeDrag}
        onDragStart={enableNativeDrag ? handleNativeDragStart : undefined}
        type="button"
        {...dndListeners}
        {...dndAttributes}
      >
        {children}
      </button>
    );
  },
);

EventWrapper.displayName = "EventWrapper";

interface EventItemProps {
  event: CalendarEvent;
  view: "month" | "week" | "day" | "agenda";
  isDragging?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  showTime?: boolean;
  currentTime?: Date; // For updating time during drag
  isFirstDay?: boolean;
  isLastDay?: boolean;
  children?: React.ReactNode;
  className?: string;
  dndListeners?: SyntheticListenerMap;
  dndAttributes?: DraggableAttributes;
  onMouseDown?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
}

export const EventItem = memo(
  forwardRef<
    HTMLButtonElement,
    EventItemProps & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "color">
  >(
    (
      {
        event,
        view,
        isDragging,
        onClick,
        showTime,
        currentTime,
        isFirstDay = true,
        isLastDay = true,
        children,
        className,
        dndListeners,
        dndAttributes,
        onMouseDown,
        onTouchStart,
        ...triggerProps
      },
      ref,
    ) => {
      const eventColor = event.color;

      // Use the provided currentTime (for dragging) or the event's actual time
      const displayStart = useMemo(() => {
        return currentTime || new Date(event.start);
      }, [currentTime, event.start]);

      const displayEnd = useMemo(() => {
        return currentTime
          ? new Date(
              new Date(currentTime).getTime() +
                (new Date(event.end).getTime() -
                  new Date(event.start).getTime()),
            )
          : new Date(event.end);
      }, [currentTime, event.start, event.end]);

      // Calculate event duration in minutes
      const durationMinutes = useMemo(() => {
        return differenceInMinutes(displayEnd, displayStart);
      }, [displayStart, displayEnd]);

      const getEventTime = () => {
        if (event.allDay) return "All day";

        // For short events (less than 45 minutes), only show start time
        if (durationMinutes < 45) {
          return formatTimeWithOptionalMinutes(displayStart);
        }

        // For longer events, show both start and end time
        return `${formatTimeWithOptionalMinutes(displayStart)} - ${formatTimeWithOptionalMinutes(displayEnd)}`;
      };

      if (view === "month") {
        return (
          <EventWrapper
            ref={ref}
            className={cn(
              "mt-[var(--event-gap)] h-[var(--event-height)] items-center text-xs",
              className,
            )}
            currentTime={currentTime}
            dndAttributes={dndAttributes}
            dndListeners={dndListeners}
            event={event}
            isDragging={isDragging}
            isFirstDay={isFirstDay}
            isLastDay={isLastDay}
            {...triggerProps}
            onClick={onClick}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
          >
            {children || (
              <span className="truncate">
                {!event.allDay && (
                  <span className="truncate font-normal opacity-70 sm:text-[11px]">
                    {formatTimeWithOptionalMinutes(displayStart)}{" "}
                  </span>
                )}
                {event.title}
              </span>
            )}
          </EventWrapper>
        );
      }

      if (view === "week" || view === "day") {
        return (
          <EventWrapper
            ref={ref}
            className={cn(
              "py-1",
              durationMinutes < 45 ? "items-center" : "flex-col",
              "text-xs",
              className,
            )}
            currentTime={currentTime}
            dndAttributes={dndAttributes}
            dndListeners={dndListeners}
            event={event}
            isDragging={isDragging}
            isFirstDay={isFirstDay}
            isLastDay={isLastDay}
            {...triggerProps}
            onClick={onClick}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
          >
            {durationMinutes < 45 ? (
              <div className="truncate">
                {event.title}{" "}
                {showTime && (
                  <span className="opacity-70">
                    {formatTimeWithOptionalMinutes(displayStart)}
                  </span>
                )}
              </div>
            ) : (
              <>
                <div className="truncate font-medium">{event.title}</div>
                {showTime && (
                  <div className="truncate font-normal opacity-70 sm:text-[11px]">
                    {getEventTime()}
                  </div>
                )}
              </>
            )}
          </EventWrapper>
        );
      }

      // Handle native HTML5 drag for external targets (e.g., copilot input)
      const handleNativeDragStart = (e: React.DragEvent) => {
        const payload = JSON.stringify({ eventIds: [event.id] });
        e.dataTransfer.setData("application/x-calendar-event-ids", payload);
        e.dataTransfer.setData("text/plain", `calendar-event-ids:${payload}`);
        e.dataTransfer.effectAllowed = "copy";
      };

      // Agenda view - kept separate since it's significantly different
      return (
        <button
          ref={ref}
          className={cn(
            "flex w-full flex-col gap-1 rounded p-2 text-left outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-past-event:line-through data-past-event:opacity-90",
            getEventColorClasses(eventColor),
            className,
          )}
          data-past-event={isPast(new Date(event.end)) || undefined}
          {...triggerProps}
          onClick={onClick}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          draggable
          onDragStart={handleNativeDragStart}
          type="button"
          {...dndListeners}
          {...dndAttributes}
        >
          <div className="text-sm font-medium text-on-surface">
            {event.title}
          </div>
          <div className="text-xs opacity-70">
            {event.allDay ? (
              <span>All day</span>
            ) : (
              <span className="uppercase">
                {formatTimeWithOptionalMinutes(displayStart)} -{" "}
                {formatTimeWithOptionalMinutes(displayEnd)}
              </span>
            )}
            {event.location && (
              <>
                <span className="px-1 opacity-35"> · </span>
                <span>{event.location}</span>
              </>
            )}
          </div>
          {event.description && (
            <div className="my-1 line-clamp-2 text-xs opacity-90">
              {stripHtml(event.description)}
            </div>
          )}
        </button>
      );
    },
  ),
);

EventItem.displayName = "EventItem";
