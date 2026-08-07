"use client";

import {
  RiArrowLeftLine,
  RiCalendarLine,
  RiDeleteBinLine,
  RiEditLine,
  RiMapPinLine,
  RiTimeLine,
} from "@remixicon/react";
import { format, isSameDay } from "date-fns";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EventDescription } from "@/components/event-calendar/event-description";
import { EventDialog } from "@/components/event-calendar/event-dialog";
import type {
  CalendarEvent,
  RecurrenceScope,
} from "@/components/event-calendar/types";
import { getEventColorClasses } from "@/components/event-calendar/utils";
import { Button } from "@/components/ui/button";
import * as eventsApi from "@/lib/api/events";
import { cn } from "@/lib/utils";

interface EventDetailProps {
  event: CalendarEvent;
}

/** Human-readable date/time range for an event, respecting all-day + multi-day. */
function formatEventWhen(event: CalendarEvent): { date: string; time: string | null } {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const sameDay = isSameDay(start, end);

  if (event.allDay) {
    if (sameDay) {
      return { date: format(start, "EEEE, MMMM d, yyyy"), time: "All day" };
    }
    return {
      date: `${format(start, "EEE, MMM d, yyyy")} → ${format(end, "EEE, MMM d, yyyy")}`,
      time: "All day",
    };
  }

  if (sameDay) {
    return {
      date: format(start, "EEEE, MMMM d, yyyy"),
      time: `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`,
    };
  }

  return {
    date: `${format(start, "EEE, MMM d, yyyy")} → ${format(end, "EEE, MMM d, yyyy")}`,
    time: `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`,
  };
}

export function EventDetail({ event: initialEvent }: EventDetailProps) {
  const router = useRouter();
  const [event, setEvent] = useState<CalendarEvent>(initialEvent);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const when = formatEventWhen(event);

  const handleSave = async (
    updated: CalendarEvent,
    recurrenceScope: RecurrenceScope,
  ) => {
    setIsEditOpen(false);
    setActionError(null);
    const previous = event;
    setEvent(updated);
    try {
      const saved = await eventsApi.updateEvent(
        updated.id,
        updated,
        recurrenceScope,
      );
      setEvent(saved);
    } catch (err) {
      setEvent(previous);
      setActionError(err instanceof Error ? err.message : "Failed to update event");
    }
  };

  const handleDelete = async (
    eventId: string,
    recurrenceScope: RecurrenceScope = "single",
  ) => {
    setIsEditOpen(false);
    setActionError(null);
    try {
      await eventsApi.deleteEvent(eventId, recurrenceScope);
      router.push("/cal");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete event");
    }
  };

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden bg-muted/40">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/cal")}
          className="gap-2 text-on-surface-variant"
        >
          <RiArrowLeftLine size={18} aria-hidden />
          Back to calendar
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsEditOpen(true)} className="gap-2">
            <RiEditLine size={16} aria-hidden />
            Edit
          </Button>
          <Button
            variant="ghost"
            onClick={() => void handleDelete(event.id)}
            className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <RiDeleteBinLine size={16} aria-hidden />
            Delete
          </Button>
        </div>
      </header>

      {/* Body */}
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-16 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {actionError && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:mt-8">
              {actionError}
            </div>
          )}
          <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm sm:mt-8">
            {/* Color accent */}
            <div
              className={cn(
                "h-2 w-full",
                getEventColorClasses(event.color).split(" ")[0],
              )}
              aria-hidden
            />

            <div className="space-y-8 p-6 sm:p-10">
              <h1 className="text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">
                {event.title || "(no title)"}
              </h1>

              <dl className="space-y-6">
                <DetailRow icon={<RiCalendarLine className="size-5" aria-hidden />}>
                  <div className="text-lg text-on-surface">{when.date}</div>
                </DetailRow>

                {when.time && (
                  <DetailRow icon={<RiTimeLine className="size-5" aria-hidden />}>
                    <div className="text-lg text-on-surface">{when.time}</div>
                  </DetailRow>
                )}

                {event.location && (
                  <DetailRow icon={<RiMapPinLine className="size-5" aria-hidden />}>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        event.location,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lg text-primary underline underline-offset-2"
                    >
                      {event.location}
                    </a>
                  </DetailRow>
                )}

                {event.description && (
                  <DetailRow icon={<span className="block size-5" aria-hidden />}>
                    <EventDescription
                      html={event.description}
                      className="text-base leading-relaxed text-on-surface"
                    />
                  </DetailRow>
                )}
              </dl>
            </div>
          </div>
        </div>
      </main>

      <EventDialog
        event={event}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSave={(updated, recurrenceScope) =>
          void handleSave(updated, recurrenceScope)
        }
        onDelete={(id, recurrenceScope) =>
          void handleDelete(id, recurrenceScope)
        }
      />
    </div>
  );
}

function DetailRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex w-5 shrink-0 justify-center pt-1 text-on-surface-variant">
        {icon}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
