"use client";

import { RiCalendarEventLine } from "@remixicon/react";
import { addDays, format, isToday } from "date-fns";
import { useMemo } from "react";

import { AgendaDaysToShow } from "@/components/event-calendar/constants";
import { EventItem } from "@/components/event-calendar/event-item";
import { EventTooltip } from "@/components/event-calendar/event-tooltip";
import type { CalendarEvent } from "@/components/event-calendar/types";
import { getAgendaEventsForDay } from "@/components/event-calendar/utils";

interface AgendaViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventSelect: (event: CalendarEvent) => void;
}

export function AgendaView({
  currentDate,
  events,
  onEventSelect,
}: AgendaViewProps) {
  const days = useMemo(() => {
    return Array.from({ length: AgendaDaysToShow }, (_, i) =>
      addDays(new Date(currentDate), i),
    );
  }, [currentDate]);

  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const hasEvents = days.some(
    (day) => getAgendaEventsForDay(events, day).length > 0,
  );

  return (
    <div className="border-border/70 border-t px-4">
      {!hasEvents ? (
        <div className="flex min-h-[70svh] flex-col items-center justify-center py-16 text-center">
          <RiCalendarEventLine
            className="mb-2 text-muted-foreground/50"
            size={32}
          />
          <h3 className="text-lg font-medium text-on-surface">No events found</h3>
          <p className="text-muted-foreground">
            There are no events scheduled for this time period.
          </p>
        </div>
      ) : (
        days.map((day) => {
          const dayEvents = getAgendaEventsForDay(events, day);

          if (dayEvents.length === 0) return null;

          return (
            <div
              className="relative my-12 border-border/70 border-t"
              key={day.toString()}
            >
              <span
                className="-top-3 absolute left-0 flex h-6 items-center bg-background pe-4 text-xs uppercase text-on-surface-variant data-today:font-medium sm:pe-4"
                data-today={isToday(day) || undefined}
              >
                {format(day, "d MMM, EEEE")}
              </span>
              <div className="mt-6 space-y-2">
                {dayEvents.map((event) => (
                  <EventTooltip event={event} key={event.id}>
                    <EventItem
                      event={event}
                      onClick={(e) => handleEventClick(event, e)}
                      view="agenda"
                    />
                  </EventTooltip>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
