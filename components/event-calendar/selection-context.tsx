"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  isBefore,
  isSameDay,
  startOfDay,
  endOfDay,
  isWithinInterval,
  addMinutes,
} from "date-fns";
import { DefaultStartHour } from "@/components/event-calendar/constants";

export interface DateTimeSelection {
  start: Date | null;
  end: Date | null;
}

interface SelectionContextType {
  isSelecting: boolean;
  selection: DateTimeSelection;
  startSelection: (date: Date, time?: number) => void;
  updateSelection: (date: Date, time?: number) => void;
  endSelection: () => void;
  cancelSelection: () => void;
  isDateInSelection: (date: Date) => boolean;
  isTimeInSelection: (date: Date, time: number) => boolean;
}

const SelectionContext = createContext<SelectionContextType>({
  isSelecting: false,
  selection: { start: null, end: null },
  startSelection: () => {},
  updateSelection: () => {},
  endSelection: () => {},
  cancelSelection: () => {},
  isDateInSelection: () => false,
  isTimeInSelection: () => false,
});

export const useSelectionContext = () => useContext(SelectionContext);

interface SelectionProviderProps {
  children: ReactNode;
  onSelectionComplete?: (selection: DateTimeSelection) => void;
}

export function SelectionProvider({
  children,
  onSelectionComplete,
}: SelectionProviderProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<DateTimeSelection>({
    start: null,
    end: null,
  });
  const [dragStart, setDragStart] = useState<Date | null>(null);

  // Store whether we're using time-based selection (week/day) or date-based (month)
  const [, setIsTimeBasedSelection] = useState(false);

  const startSelection = useCallback((date: Date, time?: number) => {
    const startDate = new Date(date);
    
    if (time !== undefined) {
      // For week/day views with specific times
      const hours = Math.floor(time);
      const minutes = Math.round((time - hours) * 60);
      startDate.setHours(hours, minutes, 0, 0);
      setIsTimeBasedSelection(true);
    } else {
      // For month view, use default start hour
      startDate.setHours(DefaultStartHour, 0, 0, 0);
      setIsTimeBasedSelection(false);
    }

    setIsSelecting(true);
    setDragStart(startDate);
    setSelection({
      start: startDate,
      // For time-based, add 15 minutes to include the full first cell
      // For date-based, use end of day
      end: time !== undefined ? addMinutes(startDate, 15) : endOfDay(startDate),
    });
  }, []);

  const updateSelection = useCallback(
    (date: Date, time?: number) => {
      if (!isSelecting || !dragStart) return;

      const currentDate = new Date(date);
      
      if (time !== undefined) {
        // For week/day views with specific times
        const hours = Math.floor(time);
        const minutes = Math.round((time - hours) * 60);
        currentDate.setHours(hours, minutes, 0, 0);
        
        // Determine direction and calculate proper start/end
        const isDraggingForward = !isBefore(currentDate, dragStart);
        
        if (isDraggingForward) {
          // Dragging forward: start stays at dragStart, end is current + 15 min
          const endTime = addMinutes(currentDate, 15);
          setSelection({
            start: dragStart,
            end: endTime,
          });
        } else {
          // Dragging backward: start is current, end is dragStart + 15 min
          const endTime = addMinutes(dragStart, 15);
          setSelection({
            start: currentDate,
            end: endTime,
          });
        }
      } else {
        // For month view, preserve time from dragStart or use end of day
        if (isBefore(currentDate, dragStart)) {
          currentDate.setHours(0, 0, 0, 0);
          setSelection({
            start: currentDate,
            end: endOfDay(dragStart),
          });
        } else {
          setSelection({
            start: startOfDay(dragStart),
            end: endOfDay(currentDate),
          });
        }
      }
    },
    [isSelecting, dragStart]
  );

  const endSelection = useCallback(() => {
    if (!isSelecting || !selection.start || !selection.end) {
      setIsSelecting(false);
      setDragStart(null);
      setIsTimeBasedSelection(false);
      return;
    }

    onSelectionComplete?.(selection);

    setIsSelecting(false);
    setDragStart(null);
    setSelection({ start: null, end: null });
    setIsTimeBasedSelection(false);
  }, [isSelecting, selection, onSelectionComplete]);

  const cancelSelection = useCallback(() => {
    setIsSelecting(false);
    setDragStart(null);
    setSelection({ start: null, end: null });
    setIsTimeBasedSelection(false);
  }, []);

  const isDateInSelection = useCallback(
    (date: Date): boolean => {
      if (!selection.start || !selection.end) return false;

      const checkDate = startOfDay(date);
      const selStart = startOfDay(selection.start);
      const selEnd = startOfDay(selection.end);

      return (
        isWithinInterval(checkDate, { start: selStart, end: selEnd }) ||
        isSameDay(checkDate, selStart) ||
        isSameDay(checkDate, selEnd)
      );
    },
    [selection]
  );

  const isTimeInSelection = useCallback(
    (date: Date, time: number): boolean => {
      if (!selection.start || !selection.end) return false;

      // Create the start time of this cell
      const cellStart = new Date(date);
      const hours = Math.floor(time);
      const minutes = Math.round((time - hours) * 60);
      cellStart.setHours(hours, minutes, 0, 0);

      // Create the end time of this cell (15 minutes later)
      const cellEnd = addMinutes(cellStart, 15);

      // A cell is in selection if it overlaps with the selection range
      // Cell overlaps if: cellStart < selectionEnd AND cellEnd > selectionStart
      return cellStart < selection.end && cellEnd > selection.start;
    },
    [selection]
  );

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({
      isSelecting,
      selection,
      startSelection,
      updateSelection,
      endSelection,
      cancelSelection,
      isDateInSelection,
      isTimeInSelection,
    }),
    [
      isSelecting,
      selection,
      startSelection,
      updateSelection,
      endSelection,
      cancelSelection,
      isDateInSelection,
      isTimeInSelection,
    ]
  );

  return (
    <SelectionContext.Provider value={contextValue}>
      {children}
    </SelectionContext.Provider>
  );
}
