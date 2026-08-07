export interface AvailabilitySlot {
  id: string
  start: Date
  end: Date
  eventTypeId: string | null
}

export type AvailabilityRangeAction = "open" | "close"

export interface WeeklyAvailabilityRule {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
  startMinute: number
  endMinute: number
}

export type SchedulingColor =
  | "sky"
  | "amber"
  | "violet"
  | "rose"
  | "emerald"
  | "orange"

export interface SchedulingEventType {
  id: string
  title: string
  slug: string
  description: string | null
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  minNoticeMinutes: number
  bookingWindowDays: number
  slotIncrementMinutes: number
  location: string | null
  color: SchedulingColor
  active: boolean
  timezone: string
  weeklyAvailability: WeeklyAvailabilityRule[]
}

export interface PublicEventType {
  slug: string
  title: string
  description: string | null
  durationMinutes: number
  location: string | null
  bookingWindowDays: number
}

export interface PublicScheduleSlot {
  start: Date
  end: Date
}

export interface ConfirmedBooking {
  bookingId: string
  eventId: string
  start: Date
  end: Date
}
