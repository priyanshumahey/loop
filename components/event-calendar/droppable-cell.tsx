"use client";

import { useDroppable } from "@dnd-kit/core";

import { useCalendarDnd } from "@/components/event-calendar/calendar-dnd-context";
import { useSelectionContext } from "@/components/event-calendar/selection-context";
import { cn } from "@/lib/utils";

interface DroppableCellProps {
  id: string;
  date: Date;
  time?: number; // For week/day views, represents hours (e.g., 9.25 for 9:15)
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseUp?: () => void;
}

export function DroppableCell({
  id,
  date,
  time,
  children,
  className,
  onClick,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
}: DroppableCellProps) {
  const { activeEvent } = useCalendarDnd();
  const { isTimeInSelection, isDateInSelection } = useSelectionContext();

  const { setNodeRef, isOver } = useDroppable({
    data: {
      date,
      time,
    },
    id,
  });

  // Format time as HH:MM for the cell's hover tooltip.
  const formattedTime =
    time !== undefined
      ? `${Math.floor(time)}:${Math.round((time - Math.floor(time)) * 60)
          .toString()
          .padStart(2, "0")}`
      : null;

  const isInSelection = time !== undefined
    ? isTimeInSelection(date, time)
    : isDateInSelection(date);

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden px-0.5 py-1 data-dragging:bg-accent sm:px-1",
        isInSelection && "bg-sky-500/20",
        className,
      )}
      data-dragging={isOver && activeEvent ? true : undefined}
      data-selecting={isInSelection || undefined}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseUp={onMouseUp}
      ref={setNodeRef}
      title={formattedTime ? `${formattedTime}` : undefined}
    >
      {children}
    </div>
  );
}
