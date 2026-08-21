import type {
  BookingStatus,
  SchedulingBooking,
  SchedulingBookingField,
  SchedulingColor,
  SchedulingEventType,
  SchedulingLocation,
  WeeklyAvailabilityRule,
} from "@/components/scheduling/types"
import type { ApiResponse } from "@/lib/api/types"

export interface EventTypeInput {
  id?: string
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

export async function fetchEventTypes(): Promise<SchedulingEventType[]> {
  const response = await fetch("/api/scheduling/event-types")
  const result: ApiResponse<SchedulingEventType[]> = await response.json()
  if (!response.ok) throw new Error(result.error || "Failed to load meeting types")
  return result.data ?? []
}

export async function saveEventType(
  input: EventTypeInput
): Promise<SchedulingEventType> {
  const response = await fetch("/api/scheduling/event-types", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const result: ApiResponse<SchedulingEventType> = await response.json()
  if (!response.ok) throw new Error(result.error || "Failed to save meeting type")
  return result.data!
}

export async function deleteEventType(id: string): Promise<void> {
  const response = await fetch(`/api/scheduling/event-types/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    const result: ApiResponse<never> = await response.json()
    throw new Error(result.error || "Failed to delete meeting type")
  }
}

interface SerializedSchedulingBooking
  extends Omit<SchedulingBooking, "start" | "end"> {
  start: string
  end: string
}

export async function fetchBookings(
  scope: "upcoming" | "past" | "all" = "upcoming"
): Promise<SchedulingBooking[]> {
  const response = await fetch(
    `/api/scheduling/bookings?scope=${encodeURIComponent(scope)}`
  )
  const result: ApiResponse<SerializedSchedulingBooking[]> = await response.json()
  if (!response.ok) throw new Error(result.error || "Failed to load bookings")
  return (result.data ?? []).map((booking) => ({
    ...booking,
    start: new Date(booking.start),
    end: new Date(booking.end),
  }))
}

export async function manageBooking(
  bookingId: string,
  action: "confirm" | "reject" | "cancel",
  reason?: string
): Promise<{ bookingId: string; status: BookingStatus }> {
  const response = await fetch(
    `/api/scheduling/bookings/${encodeURIComponent(bookingId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    }
  )
  const result: ApiResponse<{ bookingId: string; status: BookingStatus }> =
    await response.json()
  if (!response.ok || !result.data) {
    throw new Error(result.error || "Failed to update booking")
  }
  return result.data
}
