export type CalendarView = "month" | "week" | "day" | "agenda";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  color?: EventColor;
  location?: string;
  /** IANA timezone identifier (e.g., 'America/New_York') indicating the timezone context when the event was created */
  timezone?: string;
  recurrence?: EventRecurrence;
  /** Google ID of the parent recurring event when this is an expanded instance. */
  recurringEventId?: string;
  /** Stable scheduled start of this instance, even after it is moved. */
  originalStart?: string;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface EventRecurrence {
  frequency: RecurrenceFrequency;
  interval?: number;
  /** Sunday = 0 through Saturday = 6. */
  byWeekday?: number[];
  ends?: "never" | "on" | "after";
  /** Inclusive calendar date in YYYY-MM-DD format. */
  until?: string;
  count?: number;
  /** True when Google's rule contains details Loop cannot edit losslessly. */
  readOnly?: boolean;
}

export type RecurrenceScope = "single" | "following" | "series";

export type EventColor =
  | "sky"
  | "amber"
  | "violet"
  | "rose"
  | "emerald"
  | "orange";
