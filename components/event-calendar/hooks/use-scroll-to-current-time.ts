"use client";

import { isSameWeek, isToday } from "date-fns";
import { useEffect, useRef } from "react";

import { StartHour } from "@/components/event-calendar/constants";
import { useTimeScale } from "@/components/event-calendar/time-scale-context";

/**
 * Hook to scroll the calendar view to the current time on initial load
 * Only scrolls when viewing today (day view) or current week (week view)
 * Also maintains scroll position when zoom level changes
 */
export function useScrollToCurrentTime(
    currentDate: Date,
    view: "day" | "week"
) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const hasScrolledRef = useRef(false);
    const lastCellHeightRef = useRef<number | null>(null);
    
    const { cellHeight } = useTimeScale();

    // Handle initial scroll to current time (only once per view/date)
    useEffect(() => {
        const shouldScroll = view === "day"
            ? isToday(currentDate)
            : isSameWeek(currentDate, new Date(), { weekStartsOn: 0 });

        if (!shouldScroll || hasScrolledRef.current) {
            return;
        }

        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) return;

        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // Calculate position in pixels using dynamic cell height
        // We want to scroll so that current time is roughly 1/3 from the top of the viewport
        const currentTimeOffset = (hours - StartHour + minutes / 60) * cellHeight;
        const viewportHeight = scrollContainer.clientHeight;
        const scrollTarget = Math.max(0, currentTimeOffset - viewportHeight / 3);

        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            scrollContainer.scrollTo({
                top: scrollTarget,
                behavior: "instant",
            });
            hasScrolledRef.current = true;
            lastCellHeightRef.current = cellHeight;
        });
    }, [currentDate, view, cellHeight]);

    // Handle zoom: maintain relative scroll position when cell height changes
    useEffect(() => {
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer || lastCellHeightRef.current === null) return;
        
        // Only adjust if zoom changed (not on initial load)
        if (lastCellHeightRef.current === cellHeight) return;

        const oldCellHeight = lastCellHeightRef.current;
        const currentScrollTop = scrollContainer.scrollTop;
        
        // Calculate what time position the user was looking at
        // (scroll position corresponds to a time in the day)
        const timePositionRatio = currentScrollTop / oldCellHeight;
        
        // Calculate new scroll position to maintain the same time in view
        const newScrollTop = timePositionRatio * cellHeight;
        
        scrollContainer.scrollTo({
            top: newScrollTop,
            behavior: "instant",
        });
        
        lastCellHeightRef.current = cellHeight;
    }, [cellHeight]);

    // Reset the scroll flag when the date changes significantly
    useEffect(() => {
        const isRelevantDate = view === "day"
            ? isToday(currentDate)
            : isSameWeek(currentDate, new Date(), { weekStartsOn: 0 });

        if (!isRelevantDate) {
            hasScrolledRef.current = false;
        }
    }, [currentDate, view]);

    return scrollContainerRef;
}
