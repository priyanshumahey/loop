import type {
  PublicEventType,
  PublicScheduleSlot,
  SchedulingEventType,
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
    booking_window_days: number
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
          bookingWindowDays: row.booking_window_days,
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
  requestId: string
}): Promise<
  ServiceResult<{ bookingId: string; eventId: string; end: Date }>
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("book_public_schedule", {
    p_slug: input.slug,
    p_start_time: input.start.toISOString(),
    p_guest_name: input.guestName,
    p_guest_email: input.guestEmail,
    p_request_id: input.requestId,
    p_guest_notes: input.guestNotes || null,
  })
  if (error) {
    return { success: false, error: publicBookingError(error.message) }
  }
  const row = (data?.[0] ?? null) as {
    booking_id: string
    event_id: string
    end_time: string
  } | null
  if (!row) return { success: false, error: "Unable to complete this booking" }
  return {
    success: true,
    data: {
      bookingId: row.booking_id,
      eventId: row.event_id,
      end: new Date(row.end_time),
    },
  }
}