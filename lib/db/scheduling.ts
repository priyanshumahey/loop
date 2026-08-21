import type {
  BookingStatus,
  ProviderSyncStatus,
  PublicManagedBooking,
  PublicEventType,
  PublicScheduleSlot,
  SchedulingBookingField,
  SchedulingEventType,
  SchedulingLocation,
  SchedulingBooking,
  WeeklyAvailabilityRule,
} from "@/components/scheduling/types"
import { currentUser, type ServiceResult } from "@/lib/db/service"
import { createClient } from "@/lib/supabase/server"

interface DbEventType {
  id: string
  title: string
  slug: string
  description: string | null
  duration_minutes: number
  buffer_before_minutes: number
  buffer_after_minutes: number
  min_notice_minutes: number
  booking_window_days: number
  slot_increment_minutes: number
  location: string | null
  locations: SchedulingLocation[]
  booking_fields: SchedulingBookingField[]
  requires_confirmation: boolean
  disable_cancelling: boolean
  disable_rescheduling: boolean
  minimum_reschedule_notice_minutes: number
  destination_calendar_id: string
  success_redirect_url: string | null
  color: SchedulingEventType["color"]
  active: boolean
  timezone: string
  weekly_availability: WeeklyAvailabilityRule[]
}

function toEventType(row: DbEventType): SchedulingEventType {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    durationMinutes: row.duration_minutes,
    bufferBeforeMinutes: row.buffer_before_minutes,
    bufferAfterMinutes: row.buffer_after_minutes,
    minNoticeMinutes: row.min_notice_minutes,
    bookingWindowDays: row.booking_window_days,
    slotIncrementMinutes: row.slot_increment_minutes,
    location: row.location,
    locations: row.locations,
    bookingFields: row.booking_fields,
    requiresConfirmation: row.requires_confirmation,
    disableCancelling: row.disable_cancelling,
    disableRescheduling: row.disable_rescheduling,
    minimumRescheduleNoticeMinutes: row.minimum_reschedule_notice_minutes,
    destinationCalendarId: row.destination_calendar_id,
    successRedirectUrl: row.success_redirect_url,
    color: row.color,
    active: row.active,
    timezone: row.timezone,
    weeklyAvailability: row.weekly_availability,
  }
}

/**
 * Messages `book_public_schedule` raises on purpose and that are safe to show
 * to an anonymous booker. Anything else is a database detail, so it's replaced
 * with a generic message rather than echoed back.
 */
const PUBLIC_BOOKING_ERRORS = new Set([
  "Schedule not found",
  "This time is no longer available",
  "This time is outside the booking window",
  "Start time must align to an available slot",
  "Valid guest details are required",
  "A booking request id is required",
  "Booking not found",
  "Booking can no longer be cancelled",
  "Cancellation is disabled for this booking",
  "Cancellation reason is too long",
  "Booking can no longer be rescheduled",
  "Rescheduling is disabled for this booking",
  "Too many active bookings for this email address",
])

function publicBookingError(message: string): string {
  return PUBLIC_BOOKING_ERRORS.has(message)
    ? message
    : "Unable to complete this booking"
}

export async function getSchedulingEventTypes(): Promise<
  ServiceResult<SchedulingEventType[]>
> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const { data, error } = await auth.supabase
    .from("scheduling_event_types")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true })

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: ((data ?? []) as DbEventType[]).map(toEventType),
  }
}

export async function saveSchedulingEventType(input: {
  id?: string
  title: string
  slug: string
  description?: string | null
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  minNoticeMinutes: number
  bookingWindowDays: number
  slotIncrementMinutes: number
  location?: string | null
  locations: SchedulingLocation[]
  bookingFields: SchedulingBookingField[]
  requiresConfirmation: boolean
  disableCancelling: boolean
  disableRescheduling: boolean
  minimumRescheduleNoticeMinutes: number
  destinationCalendarId: string
  successRedirectUrl?: string | null
  color: SchedulingEventType["color"]
  active: boolean
  timezone: string
  weeklyAvailability: WeeklyAvailabilityRule[]
}): Promise<ServiceResult<SchedulingEventType>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const values = {
    user_id: auth.user.id,
    title: input.title,
    slug: input.slug,
    description: input.description || null,
    duration_minutes: input.durationMinutes,
    buffer_before_minutes: input.bufferBeforeMinutes,
    buffer_after_minutes: input.bufferAfterMinutes,
    min_notice_minutes: input.minNoticeMinutes,
    booking_window_days: input.bookingWindowDays,
    slot_increment_minutes: input.slotIncrementMinutes,
    location: input.location || null,
    locations: input.locations,
    booking_fields: input.bookingFields,
    requires_confirmation: input.requiresConfirmation,
    disable_cancelling: input.disableCancelling,
    disable_rescheduling: input.disableRescheduling,
    minimum_reschedule_notice_minutes: input.minimumRescheduleNoticeMinutes,
    destination_calendar_id: input.destinationCalendarId,
    success_redirect_url: input.successRedirectUrl || null,
    color: input.color,
    active: input.active,
    timezone: input.timezone,
    weekly_availability: input.weeklyAvailability,
  }

  const query = input.id
    ? auth.supabase
        .from("scheduling_event_types")
        .update(values)
        .eq("id", input.id)
        .eq("user_id", auth.user.id)
    : auth.supabase.from("scheduling_event_types").insert(values)

  const { data, error } = await query.select("*").single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: toEventType(data as DbEventType) }
}

export async function deleteSchedulingEventType(
  id: string
): Promise<ServiceResult<null>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const { error } = await auth.supabase
    .from("scheduling_event_types")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function getSchedulingBookings(options: {
  scope?: "upcoming" | "past" | "all"
  limit?: number
} = {}): Promise<ServiceResult<SchedulingBooking[]>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const now = new Date().toISOString()
  let query = auth.supabase
    .from("bookings")
    .select(
      "id, uid, event_type_id, title, description, start_time, end_time, location, timezone, status, guest_name, guest_email, guest_notes, provider_sync_status, provider_sync_attempts, provider_sync_error, provider_synced_at, created_at"
    )
    .eq("user_id", auth.user.id)
    .limit(Math.max(1, Math.min(options.limit ?? 100, 200)))

  if (options.scope === "past") {
    query = query.lt("end_time", now).order("start_time", { ascending: false })
  } else if (options.scope !== "all") {
    query = query.gte("end_time", now).order("start_time", { ascending: true })
  } else {
    query = query.order("start_time", { ascending: false })
  }

  const { data, error } = await query
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      uid: row.uid,
      eventTypeId: row.event_type_id,
      title: row.title,
      description: row.description,
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      location: row.location,
      timezone: row.timezone,
      status: row.status as BookingStatus,
      guestName: row.guest_name,
      guestEmail: row.guest_email,
      guestNotes: row.guest_notes,
      providerSyncStatus: row.provider_sync_status as ProviderSyncStatus,
      providerSyncAttempts: row.provider_sync_attempts,
      providerSyncError: row.provider_sync_error,
      providerSyncedAt: row.provider_synced_at,
      createdAt: row.created_at,
    })),
  }
}

export async function manageSchedulingBooking(input: {
  bookingId: string
  action: "confirm" | "reject" | "cancel"
  reason?: string
}): Promise<ServiceResult<{ bookingId: string; status: BookingStatus }>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const { data, error } = await auth.supabase.rpc("manage_owned_booking", {
    p_booking_id: input.bookingId,
    p_action: input.action,
    p_reason: input.reason || null,
  })
  if (error) return { success: false, error: error.message }

  const row = (data?.[0] ?? null) as {
    booking_id: string
    booking_status: BookingStatus
  } | null
  if (!row) return { success: false, error: "Booking not found" }
  return {
    success: true,
    data: { bookingId: row.booking_id, status: row.booking_status },
  }
}

export async function getPublicEventType(
  slug: string
): Promise<ServiceResult<PublicEventType | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_public_event_type", {
    p_slug: slug,
  })
  if (error) return { success: false, error: error.message }
  const row = (data?.[0] ?? null) as {
    slug: string
    title: string
    description: string | null
    duration_minutes: number
    location: string | null
    locations: SchedulingLocation[]
    booking_window_days: number
    requires_confirmation: boolean
  } | null
  return {
    success: true,
    data: row
      ? {
          slug: row.slug,
          title: row.title,
          description: row.description,
          durationMinutes: row.duration_minutes,
          location: row.location,
          locations: row.locations,
          bookingWindowDays: row.booking_window_days,
          requiresConfirmation: row.requires_confirmation,
        }
      : null,
  }
}

export async function getPublicScheduleSlots(
  slug: string,
  start: Date,
  end: Date
): Promise<ServiceResult<PublicScheduleSlot[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_public_schedule_slots", {
    p_slug: slug,
    p_start_time: start.toISOString(),
    p_end_time: end.toISOString(),
  })
  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: ((data ?? []) as { start_time: string; end_time: string }[]).map(
      (slot) => ({ start: new Date(slot.start_time), end: new Date(slot.end_time) })
    ),
  }
}

export async function bookPublicSchedule(input: {
  slug: string
  start: Date
  guestName: string
  guestEmail: string
  guestNotes?: string
  guestTimeZone: string
  guestLocale?: string
  requestId: string
}): Promise<
  ServiceResult<{
    bookingId: string
    bookingUid: string
    managementToken: string | null
    eventId: string | null
    end: Date
    status: BookingStatus
  }>
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("book_public_schedule", {
    p_slug: input.slug,
    p_start_time: input.start.toISOString(),
    p_guest_name: input.guestName,
    p_guest_email: input.guestEmail,
    p_request_id: input.requestId,
    p_guest_notes: input.guestNotes || null,
    p_guest_timezone: input.guestTimeZone,
    p_guest_locale: input.guestLocale || null,
  })
  if (error) {
    return { success: false, error: publicBookingError(error.message) }
  }
  const row = (data?.[0] ?? null) as {
    booking_id: string
    booking_uid: string
    management_token: string | null
    event_id: string | null
    end_time: string
    booking_status: BookingStatus
  } | null
  if (!row) return { success: false, error: "Unable to complete this booking" }
  return {
    success: true,
    data: {
      bookingId: row.booking_id,
      bookingUid: row.booking_uid,
      managementToken: row.management_token,
      eventId: row.event_id,
      end: new Date(row.end_time),
      status: row.booking_status,
    },
  }
}

export async function getPublicBooking(
  uid: string,
  managementToken: string
): Promise<ServiceResult<PublicManagedBooking | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_public_booking", {
    p_uid: uid,
    p_management_token: managementToken,
  })
  if (error) return { success: false, error: "Unable to load this booking" }

  const row = (data?.[0] ?? null) as {
    booking_uid: string
    event_type_slug: string | null
    title: string
    description: string | null
    start_time: string
    end_time: string
    location: string | null
    locations: PublicManagedBooking["locations"]
    timezone: string
    status: BookingStatus
    guest_name: string
    guest_email: string
    can_cancel: boolean
    can_reschedule: boolean
    minimum_reschedule_notice_minutes: number
  } | null

  return {
    success: true,
    data: row
      ? {
          bookingUid: row.booking_uid,
          eventTypeSlug: row.event_type_slug,
          title: row.title,
          description: row.description,
          start: new Date(row.start_time),
          end: new Date(row.end_time),
          location: row.location,
          locations: row.locations,
          timezone: row.timezone,
          status: row.status,
          guestName: row.guest_name,
          guestEmail: row.guest_email,
          canCancel: row.can_cancel,
          canReschedule: row.can_reschedule,
          minimumRescheduleNoticeMinutes:
            row.minimum_reschedule_notice_minutes,
        }
      : null,
  }
}

export async function cancelPublicBooking(input: {
  uid: string
  managementToken: string
  reason?: string
}): Promise<ServiceResult<{ bookingUid: string; status: BookingStatus }>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("cancel_public_booking", {
    p_uid: input.uid,
    p_management_token: input.managementToken,
    p_reason: input.reason || null,
  })
  if (error) {
    return { success: false, error: publicBookingError(error.message) }
  }

  const row = (data?.[0] ?? null) as {
    booking_uid: string
    booking_status: BookingStatus
  } | null
  if (!row) return { success: false, error: "Booking not found" }
  return {
    success: true,
    data: { bookingUid: row.booking_uid, status: row.booking_status },
  }
}

export async function reschedulePublicBooking(input: {
  uid: string
  managementToken: string
  start: Date
  requestId: string
  guestTimeZone: string
  guestLocale?: string
}): Promise<
  ServiceResult<{
    bookingId: string
    bookingUid: string
    managementToken: string | null
    eventId: string | null
    end: Date
    status: BookingStatus
  }>
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("reschedule_public_booking", {
    p_uid: input.uid,
    p_management_token: input.managementToken,
    p_start_time: input.start.toISOString(),
    p_request_id: input.requestId,
    p_guest_timezone: input.guestTimeZone,
    p_guest_locale: input.guestLocale || null,
  })
  if (error) {
    return { success: false, error: publicBookingError(error.message) }
  }

  const row = (data?.[0] ?? null) as {
    booking_id: string
    booking_uid: string
    management_token: string | null
    event_id: string | null
    end_time: string
    booking_status: BookingStatus
  } | null
  if (!row) return { success: false, error: "Unable to reschedule this booking" }
  return {
    success: true,
    data: {
      bookingId: row.booking_id,
      bookingUid: row.booking_uid,
      managementToken: row.management_token,
      eventId: row.event_id,
      end: new Date(row.end_time),
      status: row.booking_status,
    },
  }
}