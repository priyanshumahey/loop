"use client";

import { format, getMinutes } from "date-fns";
import { CalendarIcon, ClockIcon, MapPinIcon, TextIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EventDescription } from "@/components/event-calendar/event-description";
import type { CalendarEvent } from "@/components/event-calendar/types";
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

const EVENT_COLORS: Record<string, string> = {
    sky: "bg-sky-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500",
    rose: "bg-rose-500",
    emerald: "bg-emerald-500",
    orange: "bg-orange-500",
};

const formatTimeWithOptionalMinutes = (date: Date) => {
    return format(date, getMinutes(date) === 0 ? "h:mm a" : "h:mm a");
};

interface EventTooltipProps {
    event: CalendarEvent;
    children: ReactNode;
    /** Disable tooltip (e.g., when dragging) */
    disabled?: boolean;
}

/**
 * EventTooltip - Shows event details on hover
 * Displays title, time, location, and description in a styled tooltip
 */
export function EventTooltip({ event, children, disabled }: EventTooltipProps) {
    if (disabled) {
        return <>{children}</>;
    }

    const startDate = new Date(event.start);
    const endDate = new Date(event.end);
    const isSameDay = startDate.toDateString() === endDate.toDateString();

    const getTimeDisplay = () => {
        if (event.allDay) {
            return "All day";
        }
        if (isSameDay) {
            return `${formatTimeWithOptionalMinutes(startDate)} - ${formatTimeWithOptionalMinutes(endDate)}`;
        }
        return `${format(startDate, "MMM d")} ${formatTimeWithOptionalMinutes(startDate)} - ${format(endDate, "MMM d")} ${formatTimeWithOptionalMinutes(endDate)}`;
    };

    const getDateDisplay = () => {
        if (isSameDay) {
            return format(startDate, "EEEE, MMMM d, yyyy");
        }
        return `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;
    };

    const colorClass = EVENT_COLORS[event.color || "sky"] || EVENT_COLORS.sky;

    return (
        <HoverCard openDelay={300}>
            <HoverCardTrigger asChild>{children}</HoverCardTrigger>
            <HoverCardContent
                side="right"
                align="start"
                sideOffset={8}
                className="w-72 p-0 bg-popover text-popover-foreground border shadow-lg rounded-lg overflow-hidden"
            >
                {/* Color bar at top */}
                <div className={cn("h-1.5 w-full", colorClass)} />

                <div className="p-3 space-y-2.5">
                    {/* Title */}
                    <div className="font-semibold text-sm text-foreground leading-tight">
                        {event.title || "(No title)"}
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                        <span>{getDateDisplay()}</span>
                    </div>

                    {/* Time */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                        <span>{getTimeDisplay()}</span>
                    </div>

                    {/* Location */}
                    {event.location && (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground">
                            <MapPinIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{event.location}</span>
                        </div>
                    )}

                    {/* Description */}
                    {event.description && (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground pt-1 border-t border-border/50">
                            <TextIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <EventDescription
                                html={event.description}
                                className="max-h-40 overflow-y-auto"
                            />
                        </div>
                    )}
                </div>
            </HoverCardContent>
        </HoverCard>
    );
}
