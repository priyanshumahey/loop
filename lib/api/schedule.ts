import type {
  BookingStatus,
  ConfirmedBooking,
  PublicScheduleSlot,
} from "@/components/scheduling/types"
import type { ApiResponse } from "@/lib/api/types"

const API_BASE = "/api/schedule"

interface SerializedSlot {
  start: string
  end: string
}

interface SerializedBooking {
  bookingId: string
  bookingUid: string
  managementToken: string | null
  eventId: string | null
  start: string
  end: string
  status: BookingStatus
}

/** Open slots for a public booking page, within a range of at most 31 days. */
export async function fetchPublicSlots(
  slug: string,
  start: Date,
  end: Date
): Promise<PublicScheduleSlot[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  })
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(slug)}/slots?${params}`
  )
  const result: ApiResponse<SerializedSlot[]> = await response.json()
  if (!response.ok) throw new Error(result.error || "Failed to load times")

  return (result.data ?? []).map((slot) => ({
    start: new Date(slot.start),
    end: new Date(slot.end),
  }))
}

/**
 * Book a slot on a public page. `requestId` makes the call idempotent, so a
 * retry of the same slot can never produce a second booking.
 */
export async function bookPublicSlot(
  slug: string,
  input: {
    start: Date
    guestName: string
    guestEmail: string
    guestNotes?: string
    guestTimeZone: string
    guestLocale?: string
    requestId: string
  }
): Promise<ConfirmedBooking> {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(slug)}/book`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, start: input.start.toISOString() }),
    }
  )
  const result: ApiResponse<SerializedBooking> = await response.json()
  if (!response.ok || !result.data) {
    throw new Error(result.error || "Failed to book this time")
  }

  return {
    bookingId: result.data.bookingId,
    bookingUid: result.data.bookingUid,
    managementToken: result.data.managementToken,
    eventId: result.data.eventId,
    start: new Date(result.data.start),
    end: new Date(result.data.end),
    status: result.data.status,
  }
}

export async function cancelPublicBooking(
  bookingUid: string,
  managementToken: string,
  reason?: string
): Promise<{ status: BookingStatus }> {
  const response = await fetch(
    `${API_BASE}/manage/${encodeURIComponent(bookingUid)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managementToken, reason }),
    }
  )
  const result: ApiResponse<{ bookingUid: string; status: BookingStatus }> =
    await response.json()
  if (!response.ok || !result.data) {
    throw new Error(result.error || "Failed to cancel this booking")
  }
  return { status: result.data.status }
}

export async function reschedulePublicBooking(
  bookingUid: string,
  input: {
    managementToken: string
    start: Date
    requestId: string
    guestTimeZone: string
    guestLocale?: string
  }
): Promise<ConfirmedBooking> {
  const response = await fetch(
    `${API_BASE}/manage/${encodeURIComponent(bookingUid)}/reschedule`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, start: input.start.toISOString() }),
    }
  )
  const result: ApiResponse<SerializedBooking> = await response.json()
  if (!response.ok || !result.data) {
    throw new Error(result.error || "Failed to reschedule this booking")
  }
  return {
    bookingId: result.data.bookingId,
    bookingUid: result.data.bookingUid,
    managementToken: result.data.managementToken,
    eventId: result.data.eventId,
    start: new Date(result.data.start),
    end: new Date(result.data.end),
    status: result.data.status,
  }
}
