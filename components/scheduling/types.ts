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

export type SchedulingLocation = {
  type: "google_meet" | "link" | "phone" | "in_person"
  value?: string
}

export type SchedulingBookingField = {
  id: string
  label: string
  type:
    | "text"
    | "textarea"
    | "phone"
    | "number"
    | "select"
    | "multiselect"
    | "checkbox"
    | "radio"
    | "url"
  required?: boolean
  options?: string[]
}

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
  locations: SchedulingLocation[]
  bookingFields: SchedulingBookingField[]
  requiresConfirmation: boolean
  disableCancelling: boolean
  disableRescheduling: boolean
  minimumRescheduleNoticeMinutes: number
  destinationCalendarId: string
  successRedirectUrl: string | null
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
  locations: SchedulingLocation[]
  bookingWindowDays: number
  requiresConfirmation: boolean
}

export interface PublicScheduleSlot {
  start: Date
  end: Date
}

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "rejected"
  | "rescheduled"

export type ProviderSyncStatus = "pending" | "processing" | "synced" | "failed"

export interface SchedulingBooking {
  id: string
  uid: string
  eventTypeId: string | null
  title: string
  description: string | null
  start: Date
  end: Date
  location: string | null
  timezone: string
  status: BookingStatus
  guestName: string
  guestEmail: string
  guestNotes: string | null
  providerSyncStatus: ProviderSyncStatus
  providerSyncAttempts: number
  providerSyncError: string | null
  providerSyncedAt: string | null
  createdAt: string
}

export interface ConfirmedBooking {
  bookingId: string
  bookingUid: string
  managementToken: string | null
  eventId: string | null
  start: Date
  end: Date
  status: BookingStatus
}

export interface PublicManagedBooking {
  bookingUid: string
  eventTypeSlug: string | null
  title: string
  description: string | null
  start: Date
  end: Date
  location: string | null
  locations: SchedulingLocation[]
  timezone: string
  status: BookingStatus
  guestName: string
  guestEmail: string
  canCancel: boolean
  canReschedule: boolean
  minimumRescheduleNoticeMinutes: number
}
