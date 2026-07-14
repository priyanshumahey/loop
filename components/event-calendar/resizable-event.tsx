"use client";

import { addMinutes, differenceInMinutes, format } from "date-fns";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { useTimeScale } from "@/components/event-calendar/time-scale-context";
import type { CalendarEvent } from "@/components/event-calendar/types";
import { cn } from "@/lib/utils";

interface ResizableEventProps {
    event: CalendarEvent;
    children: React.ReactNode;
    onResize: (event: CalendarEvent, newStart: Date, newEnd: Date) => void;
    minDurationMinutes?: number;
    className?: string;
}

type ResizeDirection = "top" | "bottom" | null;

/**
 * Format time for the tooltip (e.g., "9:30 AM")
 */
function formatTime(date: Date): string {
    return format(date, "h:mm a");
}

/**
 * Wrapper component that adds resize handles to calendar events
 * Allows users to drag the top or bottom edge to change event duration
 */
export const ResizableEvent = memo(function ResizableEvent({
    event,
    children,
    onResize,
    minDurationMinutes = 15,
    className,
}: ResizableEventProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeDirection, setResizeDirection] = useState<ResizeDirection>(null);

    const { cellHeight } = useTimeScale();

    const resizeStartRef = useRef<{
        startY: number;
        originalStart: Date;
        originalEnd: Date;
        originalHeight: number;
    } | null>(null);

    const [previewOffset, setPreviewOffset] = useState({ top: 0, bottom: 0 });

    const [previewTimes, setPreviewTimes] = useState<{ start: Date; end: Date } | null>(null);

    const handleResizeStart = useCallback(
        (direction: ResizeDirection, e: React.MouseEvent | React.TouchEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (!containerRef.current) return;

            const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
            const rect = containerRef.current.getBoundingClientRect();

            const originalStart = new Date(event.start);
            const originalEnd = new Date(event.end);

            resizeStartRef.current = {
                startY: clientY,
                originalStart,
                originalEnd,
                originalHeight: rect.height,
            };

            setIsResizing(true);
            setResizeDirection(direction);
            setPreviewOffset({ top: 0, bottom: 0 });
            setPreviewTimes({ start: originalStart, end: originalEnd });
        },
        [event.start, event.end]
    );

    const handleResizeMove = useCallback(
        (e: MouseEvent | TouchEvent) => {
            if (!isResizing || !resizeStartRef.current || !resizeDirection) return;

            const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY;
            const deltaY = clientY - resizeStartRef.current.startY;

            // Convert pixel delta to minutes (cellHeight pixels = 60 minutes)
            const deltaMinutes = Math.round((deltaY / cellHeight) * 60);

            // Snap to 15-minute intervals
            const snappedDeltaMinutes = Math.round(deltaMinutes / 15) * 15;

            const { originalStart, originalEnd } = resizeStartRef.current;
            const originalDuration = differenceInMinutes(originalEnd, originalStart);

            if (resizeDirection === "top") {
                // Resizing from top - changes start time
                const newDuration = originalDuration - snappedDeltaMinutes;
                if (newDuration >= minDurationMinutes) {
                    const pixelOffset = (snappedDeltaMinutes / 60) * cellHeight;
                    setPreviewOffset({ top: pixelOffset, bottom: 0 });
                    const newStart = addMinutes(originalStart, snappedDeltaMinutes);
                    setPreviewTimes({ start: newStart, end: originalEnd });
                }
            } else if (resizeDirection === "bottom") {
                // Resizing from bottom - changes end time
                const newDuration = originalDuration + snappedDeltaMinutes;
                if (newDuration >= minDurationMinutes) {
                    const pixelOffset = (snappedDeltaMinutes / 60) * cellHeight;
                    setPreviewOffset({ top: 0, bottom: pixelOffset });
                    const newEnd = addMinutes(originalEnd, snappedDeltaMinutes);
                    setPreviewTimes({ start: originalStart, end: newEnd });
                }
            }
        },
        [isResizing, resizeDirection, minDurationMinutes, cellHeight]
    );

    const handleResizeEnd = useCallback(() => {
        if (!isResizing || !resizeStartRef.current || !resizeDirection) {
            setIsResizing(false);
            setResizeDirection(null);
            setPreviewOffset({ top: 0, bottom: 0 });
            setPreviewTimes(null);
            return;
        }

        const { originalStart, originalEnd } = resizeStartRef.current;
        const originalDuration = differenceInMinutes(originalEnd, originalStart);

        let newStart = originalStart;
        let newEnd = originalEnd;

        if (resizeDirection === "top") {
            // Convert preview offset back to minutes
            const deltaMinutes = Math.round((previewOffset.top / cellHeight) * 60);
            const newDuration = originalDuration - deltaMinutes;

            if (newDuration >= minDurationMinutes) {
                newStart = addMinutes(originalStart, deltaMinutes);
            }
        } else if (resizeDirection === "bottom") {
            // Convert preview offset back to minutes
            const deltaMinutes = Math.round((previewOffset.bottom / cellHeight) * 60);
            const newDuration = originalDuration + deltaMinutes;

            if (newDuration >= minDurationMinutes) {
                newEnd = addMinutes(originalEnd, deltaMinutes);
            }
        }

        // Only trigger update if times actually changed
        if (
            newStart.getTime() !== originalStart.getTime() ||
            newEnd.getTime() !== originalEnd.getTime()
        ) {
            onResize(event, newStart, newEnd);
        }

        // Reset state
        setIsResizing(false);
        setResizeDirection(null);
        setPreviewOffset({ top: 0, bottom: 0 });
        setPreviewTimes(null);
        resizeStartRef.current = null;
    }, [isResizing, resizeDirection, previewOffset, event, onResize, minDurationMinutes, cellHeight]);

    // Add global mouse/touch event listeners during resize
    useEffect(() => {
        if (!isResizing) return;

        const handleMove = (e: MouseEvent | TouchEvent) => {
            handleResizeMove(e);
        };

        const handleEnd = () => {
            handleResizeEnd();
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleEnd);
        window.addEventListener("touchmove", handleMove);
        window.addEventListener("touchend", handleEnd);

        // Add cursor style to body during resize
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";

        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleEnd);
            window.removeEventListener("touchmove", handleMove);
            window.removeEventListener("touchend", handleEnd);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [isResizing, handleResizeMove, handleResizeEnd]);

    return (
        <div
            ref={containerRef}
            className={cn("group/resize relative h-full", className)}
            data-resizing={isResizing || undefined}
        >
            {/* Shadow preview showing final size during resize */}
            {isResizing && (
                <div
                    className="absolute inset-0 pointer-events-none z-10"
                    style={{
                        top: resizeDirection === "top" ? `${previewOffset.top}px` : 0,
                        bottom: resizeDirection === "bottom" ? `${-previewOffset.bottom}px` : 0,
                    }}
                >
                    <div className="h-full w-full rounded-md bg-primary/20 border-2 border-dashed border-primary/40" />
                </div>
            )}

            {/* Top resize handle - invisible but functional */}
            <div
                className={cn(
                    "absolute top-0 left-0 right-0 h-3 cursor-ns-resize z-30",
                    // Only show visual indicator when actively resizing this handle
                    isResizing && resizeDirection === "top" && "bg-primary/20"
                )}
                onMouseDown={(e) => handleResizeStart("top", e)}
                onTouchStart={(e) => handleResizeStart("top", e)}
            />

            {/* Time tooltip - shows during resize */}
            {isResizing && previewTimes && (
                <div
                    className={cn(
                        "absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none",
                        "bg-popover text-popover-foreground shadow-lg rounded-md px-2 py-1",
                        "text-xs font-medium whitespace-nowrap border border-border",
                        resizeDirection === "top" ? "-top-8" : "-bottom-8"
                    )}
                >
                    {resizeDirection === "top"
                        ? formatTime(previewTimes.start)
                        : formatTime(previewTimes.end)
                    }
                </div>
            )}

            {/* Event content - stays at original position during resize */}
            <div className="h-full relative z-20">
                {children}
            </div>

            {/* Bottom resize handle - invisible but functional */}
            <div
                className={cn(
                    "absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize z-30",
                    // Only show visual indicator when actively resizing this handle
                    isResizing && resizeDirection === "bottom" && "bg-primary/20"
                )}
                onMouseDown={(e) => handleResizeStart("bottom", e)}
                onTouchStart={(e) => handleResizeStart("bottom", e)}
            />
        </div>
    );
});
