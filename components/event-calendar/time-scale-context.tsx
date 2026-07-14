"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
    type RefCallback,
} from "react";

import { WeekCellsHeight } from "@/components/event-calendar/constants";

// Zoom levels as multipliers of the base cell height
const MIN_SCALE = 0.5; // 50% of original (32px per hour)
const MAX_SCALE = 3.0; // 300% of original (192px per hour)
const SCALE_STEP = 0.1; // 10% per scroll tick
const STORAGE_KEY = "calendar-time-scale";

interface TimeScaleContextValue {
    /** The current scale multiplier (1.0 = default) */
    scale: number;
    /** The actual cell height in pixels (WeekCellsHeight * scale) */
    cellHeight: number;
    /** Ref callback to attach to the zoomable container */
    zoomContainerRef: RefCallback<HTMLDivElement>;
    /** Reset scale to default */
    resetScale: () => void;
    /** Current zoom percentage for display */
    zoomPercentage: number;
}

const TimeScaleContext = createContext<TimeScaleContextValue | null>(null);

interface TimeScaleProviderProps {
    children: ReactNode;
    /** Whether to persist the scale in localStorage */
    persist?: boolean;
}

/**
 * Provider for time scale (zoom) state shared across week and day views
 * Allows zooming in/out with Ctrl/Cmd + scroll wheel
 */
export function TimeScaleProvider({
    children,
    persist = true,
}: TimeScaleProviderProps) {
    const [scale, setScale] = useState<number>(1.0);
    const [isInitialized, setIsInitialized] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Initialize from localStorage on mount
    useEffect(() => {
        if (persist && typeof window !== "undefined") {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = parseFloat(stored);
                if (!isNaN(parsed) && parsed >= MIN_SCALE && parsed <= MAX_SCALE) {
                    setScale(parsed);
                }
            }
        }
        setIsInitialized(true);
    }, [persist]);

    // Persist scale changes (after initialization)
    useEffect(() => {
        if (isInitialized && persist && typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY, scale.toString());
        }
    }, [scale, persist, isInitialized]);

    // Native wheel handler that can preventDefault
    const handleWheelNative = useCallback((e: WheelEvent) => {
        // Only zoom when Ctrl (Windows/Linux) or Cmd (Mac) is pressed
        if (!e.ctrlKey && !e.metaKey) return;

        // Prevent browser zoom
        e.preventDefault();
        e.stopPropagation();

        // deltaY is negative when scrolling up (zoom in), positive when scrolling down (zoom out)
        const direction = e.deltaY > 0 ? -1 : 1;

        setScale((prev) => {
            const newScale = prev + direction * SCALE_STEP;
            // Round to avoid floating point issues
            return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale)) * 10) / 10;
        });
    }, []);

    // Ref callback to attach non-passive wheel listener
    const zoomContainerRef: RefCallback<HTMLDivElement> = useCallback(
        (node) => {
            // Remove listener from old node
            if (containerRef.current) {
                containerRef.current.removeEventListener("wheel", handleWheelNative);
            }

            // Add listener to new node with { passive: false }
            if (node) {
                node.addEventListener("wheel", handleWheelNative, { passive: false });
            }

            containerRef.current = node;
        },
        [handleWheelNative]
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (containerRef.current) {
                containerRef.current.removeEventListener("wheel", handleWheelNative);
            }
        };
    }, [handleWheelNative]);

    const resetScale = useCallback(() => {
        setScale(1.0);
    }, []);

    // Memoize context value to prevent unnecessary re-renders of consumers
    const value = useMemo<TimeScaleContextValue>(
        () => ({
            scale,
            cellHeight: WeekCellsHeight * scale,
            zoomContainerRef,
            resetScale,
            zoomPercentage: Math.round(scale * 100),
        }),
        [scale, zoomContainerRef, resetScale]
    );

    return (
        <TimeScaleContext.Provider value={value}>
            {children}
        </TimeScaleContext.Provider>
    );
}

/**
 * Hook to access time scale context
 */
export function useTimeScale(): TimeScaleContextValue {
    const context = useContext(TimeScaleContext);
    if (!context) {
        throw new Error("useTimeScale must be used within a TimeScaleProvider");
    }
    return context;
}
