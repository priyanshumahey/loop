"use client";

import {
  RiAlignLeft,
  RiCalendarLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiExpandDiagonalLine,
  RiMapPinLine,
  RiTimeLine,
} from "@remixicon/react";
import { format, isBefore } from "date-fns";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CalendarEvent,
  EventColor,
} from "@/components/event-calendar/types";
import {
  DefaultEndHour,
  DefaultStartHour,
  EndHour,
  StartHour,
} from "@/components/event-calendar/constants";
import { htmlToText } from "@/components/event-calendar/event-description";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface EventDialogProps {
  event: CalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
}

export function EventDialog({
  event,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: EventDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState(`${DefaultStartHour}:00`);
  const [endTime, setEndTime] = useState(`${DefaultEndHour}:00`);
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [color, setColor] = useState<EventColor>("sky");
  const [error, setError] = useState<string | null>(null);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Grow the description field to fit its content (up to a cap, then scroll) so
  // long agendas are readable without a cramped inner scrollbar.
  const autoGrowDescription = useCallback(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, []);

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setStartDate(new Date());
    setEndDate(new Date());
    setStartTime(`${DefaultStartHour}:00`);
    setEndTime(`${DefaultEndHour}:00`);
    setAllDay(false);
    setLocation("");
    setColor("sky");
    setError(null);
  }, []);

  const formatTimeForInput = useCallback((date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = Math.floor(date.getMinutes() / 15) * 15;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    if (event) {
      setTitle(event.title || "");
      setDescription(htmlToText(event.description || ""));

      const start = new Date(event.start);
      const end = new Date(event.end);

      setStartDate(start);
      setEndDate(end);
      setStartTime(formatTimeForInput(start));
      setEndTime(formatTimeForInput(end));
      setAllDay(event.allDay || false);
      setLocation(event.location || "");
      setColor((event.color as EventColor) || "sky");
      setError(null); // Reset error when opening dialog
    } else {
      resetForm();
    }
  }, [event, formatTimeForInput, resetForm]);

  // Re-fit the description box whenever its content changes or the dialog opens.
  useEffect(() => {
    if (isOpen) autoGrowDescription();
  }, [description, isOpen, autoGrowDescription]);

  // Memoize time options so they're only calculated once
  const timeOptions = useMemo(() => {
    const options = [];
    for (let hour = StartHour; hour <= EndHour; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const formattedHour = hour.toString().padStart(2, "0");
        const formattedMinute = minute.toString().padStart(2, "0");
        const value = `${formattedHour}:${formattedMinute}`;
        // Use a fixed date to avoid unnecessary date object creations
        const date = new Date(2000, 0, 1, hour, minute);
        const label = format(date, "h:mm a");
        options.push({ label, value });
      }
    }
    return options;
  }, []);

  const handleSave = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!allDay) {
      const [startHours = 0, startMinutes = 0] = startTime
        .split(":")
        .map(Number);
      const [endHours = 0, endMinutes = 0] = endTime.split(":").map(Number);

      if (
        startHours < StartHour ||
        startHours > EndHour ||
        endHours < StartHour ||
        endHours > EndHour
      ) {
        setError(
          `Selected time must be between ${StartHour}:00 and ${EndHour}:00`,
        );
        return;
      }

      start.setHours(startHours, startMinutes, 0);
      end.setHours(endHours, endMinutes, 0);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    // Validate that end date is not before start date
    if (isBefore(end, start)) {
      setError("End date cannot be before start date");
      return;
    }

    // Use generic title if empty
    const eventTitle = title.trim() ? title : "(no title)";

    onSave({
      allDay,
      color,
      description,
      end,
      id: event?.id || "",
      location,
      start,
      title: eventTitle,
    });
  };

  const handleDelete = () => {
    if (event?.id) {
      onDelete(event.id);
    }
  };

  // Updated color options to match types.ts
  const colorOptions: Array<{
    value: EventColor;
    label: string;
    bgClass: string;
    borderClass: string;
  }> = [
    {
      bgClass: "bg-sky-400 data-[state=checked]:bg-sky-400",
      borderClass: "border-sky-400 data-[state=checked]:border-sky-400",
      label: "Sky",
      value: "sky",
    },
    {
      bgClass: "bg-amber-400 data-[state=checked]:bg-amber-400",
      borderClass: "border-amber-400 data-[state=checked]:border-amber-400",
      label: "Amber",
      value: "amber",
    },
    {
      bgClass: "bg-violet-400 data-[state=checked]:bg-violet-400",
      borderClass: "border-violet-400 data-[state=checked]:border-violet-400",
      label: "Violet",
      value: "violet",
    },
    {
      bgClass: "bg-rose-400 data-[state=checked]:bg-rose-400",
      borderClass: "border-rose-400 data-[state=checked]:border-rose-400",
      label: "Rose",
      value: "rose",
    },
    {
      bgClass: "bg-emerald-400 data-[state=checked]:bg-emerald-400",
      borderClass: "border-emerald-400 data-[state=checked]:border-emerald-400",
      label: "Emerald",
      value: "emerald",
    },
    {
      bgClass: "bg-orange-400 data-[state=checked]:bg-orange-400",
      borderClass: "border-orange-400 data-[state=checked]:border-orange-400",
      label: "Orange",
      value: "orange",
    },
  ];

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="gap-0 p-0 sm:max-w-[520px]">
        <DialogHeader className="space-y-1 px-6 pt-6 pb-4">
          <DialogTitle className="text-lg">
            {event?.id ? "Edit event" : "New event"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {event?.id
              ? "Make changes to your event below."
              : "Fill in the details for your new event."}
          </DialogDescription>
          {event?.id && (
            <button
              type="button"
              aria-label="Open in full screen"
              title="Open in full screen"
              onClick={() => {
                onClose();
                router.push(`/cal/event/${event.id}`);
              }}
              className="group absolute top-4 right-14 flex size-8 items-center justify-center rounded-full bg-surface-container outline-none transition-all hover:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <RiExpandDiagonalLine
                className="opacity-60 transition-opacity group-hover:opacity-100"
                size={16}
                aria-hidden
              />
            </button>
          )}
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-6 pb-2">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <RiErrorWarningLine className="size-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          {/* Title — large, borderless, focal */}
          <input
            id="title"
            placeholder="Add title"
            className="w-full border-0 border-b border-transparent bg-transparent px-0 pb-2 text-xl font-medium text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus:border-border"
            onChange={(e) => setTitle(e.target.value)}
            value={title}
            autoFocus
          />

          <div className="mt-4 space-y-1">
            {/* All-day toggle */}
            <Row icon={<RiTimeLine className="size-5" aria-hidden />}>
              <button
                type="button"
                onClick={() => setAllDay(!allDay)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-surface-container/60"
              >
                <span className="text-on-surface">All day</span>
                <span
                  className={cn(
                    "relative h-5 w-9 rounded-full transition-colors",
                    allDay ? "bg-brand" : "bg-surface-container-highest",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
                      allDay && "translate-x-4",
                    )}
                  />
                </span>
              </button>
            </Row>

            {/* Start */}
            <Row icon={<RiCalendarLine className="size-5" aria-hidden />}>
              <div className="flex items-center gap-2">
                <DateField
                  label="Start date"
                  date={startDate}
                  open={startDateOpen}
                  setOpen={setStartDateOpen}
                  onSelect={(date) => {
                    setStartDate(date);
                    if (isBefore(endDate, date)) setEndDate(date);
                    setError(null);
                    setStartDateOpen(false);
                  }}
                />
                {!allDay && (
                  <TimeField
                    value={startTime}
                    onChange={setStartTime}
                    options={timeOptions}
                  />
                )}
              </div>
            </Row>

            {/* End */}
            <Row icon={<span className="size-5" />}>
              <div className="flex items-center gap-2">
                <DateField
                  label="End date"
                  date={endDate}
                  open={endDateOpen}
                  setOpen={setEndDateOpen}
                  disabledBefore={startDate}
                  onSelect={(date) => {
                    setEndDate(date);
                    setError(null);
                    setEndDateOpen(false);
                  }}
                />
                {!allDay && (
                  <TimeField
                    value={endTime}
                    onChange={setEndTime}
                    options={timeOptions}
                  />
                )}
              </div>
            </Row>

            {/* Location */}
            <Row icon={<RiMapPinLine className="size-5" aria-hidden />}>
              <input
                id="location"
                placeholder="Add location"
                className="w-full rounded-lg bg-transparent px-2 py-2 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 hover:bg-surface-container/60 focus:bg-surface-container/60"
                onChange={(e) => setLocation(e.target.value)}
                value={location}
              />
            </Row>

            {/* Description */}
            <Row icon={<RiAlignLeft className="size-5" aria-hidden />} align="start">
              <Textarea
                ref={descriptionRef}
                id="description"
                placeholder="Add description"
                className="max-h-80 min-h-[96px] resize-y overflow-y-auto border-0 bg-transparent px-2 py-2 text-[15px] leading-relaxed whitespace-pre-wrap shadow-none focus-visible:ring-0 hover:bg-surface-container/60"
                onChange={(e) => {
                  setDescription(e.target.value);
                  autoGrowDescription();
                }}
                rows={4}
                value={description}
              />
            </Row>

            {/* Color */}
            <Row icon={<span className="size-3 rounded-full bg-current opacity-70" />}>
              <RadioGroup
                className="flex gap-2 px-2 py-1.5"
                onValueChange={(value: EventColor) => setColor(value)}
                value={color}
              >
                {colorOptions.map((colorOption) => (
                  <RadioGroupItem
                    aria-label={colorOption.label}
                    className={cn(
                      "size-6 rounded-full border shadow-none transition-transform hover:scale-110 data-[state=checked]:ring-2 data-[state=checked]:ring-offset-2 data-[state=checked]:ring-offset-surface",
                      colorOption.bgClass,
                      colorOption.borderClass,
                    )}
                    id={`color-${colorOption.value}`}
                    key={colorOption.value}
                    value={colorOption.value}
                  />
                ))}
              </RadioGroup>
            </Row>
          </div>
        </div>

        <DialogFooter className="flex-row items-center gap-2 border-t border-border/50 px-6 py-4 sm:justify-between">
          {event?.id ? (
            <Button
              aria-label="Delete event"
              onClick={handleDelete}
              size="icon"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <RiDeleteBinLine aria-hidden size={18} />
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button onClick={onClose} variant="ghost">
              Cancel
            </Button>
            <Button onClick={handleSave} className="min-w-[88px]">
              {event?.id ? "Save" : "Create"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A leading-icon aligned form row, à la Google Calendar. */
function Row({
  icon,
  children,
  align = "center",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div
      className={cn(
        "flex gap-3",
        align === "center" ? "items-center" : "items-start",
      )}
    >
      <div
        className={cn(
          "flex w-5 shrink-0 justify-center text-on-surface-variant",
          align === "start" && "pt-3",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Date picker trigger + popover calendar. */
function DateField({
  label,
  date,
  open,
  setOpen,
  onSelect,
  disabledBefore,
}: {
  label: string;
  date: Date;
  open: boolean;
  setOpen: (open: boolean) => void;
  onSelect: (date: Date) => void;
  disabledBefore?: Date;
}) {
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex-1 rounded-lg px-2 py-2 text-left text-sm text-on-surface transition-colors hover:bg-surface-container/60 data-[state=open]:bg-surface-container/60"
        >
          {format(date, "EEE, MMM d")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          defaultMonth={date}
          disabled={disabledBefore ? { before: disabledBefore } : undefined}
          mode="single"
          onSelect={(d) => d && onSelect(d)}
          selected={date}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Time selector. */
function TimeField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger className="w-[110px] border-0 bg-transparent shadow-none hover:bg-surface-container/60 data-[state=open]:bg-surface-container/60">
        <SelectValue placeholder="Time" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
