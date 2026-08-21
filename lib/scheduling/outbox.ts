import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import {
  pushBookingToGoogle,
  removeBookingFromGoogle,
  rescheduleBookingOnGoogle,
} from "@/lib/google-sync"
import { createAdminClient } from "@/lib/supabase/admin"

const locationSchema = z.object({
  type: z.enum(["google_meet", "link", "phone", "in_person"]),
  value: z.string().optional(),
})

const eventTypeSnapshotSchema = z
  .object({
    locations: z.array(locationSchema).min(1).default([{ type: "google_meet" }]),
    timezone: z.string().min(1).default("UTC"),
    destinationCalendarId: z.string().min(1).default("primary"),
  })
  .passthrough()

interface SchedulingOutboxJob {
  id: string
  booking_id: string
  user_id: string
  event_type:
    | "booking.created"
    | "booking.cancelled"
    | "booking.rescheduled"
    | "booking.confirmed"
    | "booking.rejected"
  attempts: number
  lease_token: string
}

interface BookingRow {
  id: string
  uid: string
  event_id: string | null
  user_id: string
  status: "pending" | "confirmed" | "cancelled" | "rejected" | "rescheduled"
  guest_name: string
  guest_email: string
  guest_notes: string | null
  guest_timezone: string
  guest_locale: string | null
  event_type_snapshot: unknown
  rescheduled_from_id: string | null
  title: string
  description: string | null
  start_time: string
  end_time: string
  timezone: string | null
  location: string | null
}

interface AttendeeRow {
  name: string
  email: string
}

export interface SchedulingOutboxResult {
  claimed: number
  completed: number
  failed: number
  stale: number
}

function messageFrom(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown scheduling error").slice(
    0,
    2_000
  )
}

function retryAt(attempt: number): string {
  const seconds = Math.min(3_600, 30 * 2 ** Math.min(Math.max(attempt - 1, 0), 7))
  return new Date(Date.now() + seconds * 1_000).toISOString()
}

/** Google accepts lowercase base32hex characters; UUID hex is a valid subset. */
function bookingGoogleEventId(bookingUid: string): string {
  return `loop${bookingUid.replaceAll("-", "").toLowerCase()}`
}

async function insertAudit(
  admin: SupabaseClient,
  job: SchedulingOutboxJob,
  action:
    | "provider_sync_started"
    | "provider_sync_succeeded"
    | "provider_sync_failed",
  data: Record<string, unknown>
) {
  const { error } = await admin.from("booking_audit_log").insert({
    booking_id: job.booking_id,
    user_id: job.user_id,
    action,
    actor_type: "provider",
    actor_label: "google_calendar",
    data,
  })
  if (error) throw new Error(error.message)
}

async function bookingIsStillConfirmed(
  admin: SupabaseClient,
  bookingId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .single()
  if (error || !data) throw new Error(error?.message ?? "Booking not found")
  return data.status === "confirmed"
}

async function loadBookingProjection(
  admin: SupabaseClient,
  job: SchedulingOutboxJob
): Promise<{
  booking: BookingRow
  attendees: AttendeeRow[]
}> {
  const { data: bookingData, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, uid, event_id, user_id, status, guest_name, guest_email, guest_notes, guest_timezone, guest_locale, event_type_snapshot, rescheduled_from_id, title, description, start_time, end_time, timezone, location"
    )
    .eq("id", job.booking_id)
    .single()
  if (bookingError || !bookingData) {
    throw new Error(bookingError?.message ?? "Booking not found")
  }
  const booking = bookingData as BookingRow

  const attendeeResult = await admin
    .from("booking_attendees")
    .select("name, email")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: true })
  if (attendeeResult.error) throw new Error(attendeeResult.error.message)

  const attendees = (attendeeResult.data ?? []) as AttendeeRow[]
  return {
    booking,
    attendees:
      attendees.length > 0
        ? attendees
        : [{ name: booking.guest_name, email: booking.guest_email }],
  }
}

async function syncConfirmedBooking(
  admin: SupabaseClient,
  job: SchedulingOutboxJob
) {
  const { booking, attendees } = await loadBookingProjection(admin, job)

  if (booking.status === "pending") return
  if (booking.status !== "confirmed") return

  const snapshot = eventTypeSnapshotSchema.parse(booking.event_type_snapshot)
  const location = snapshot.locations[0]
  const createGoogleMeet = location.type === "google_meet"
  const eventId = bookingGoogleEventId(booking.uid)

  const { error: processingError } = await admin
    .from("bookings")
    .update({
      provider_sync_status: "processing",
      provider_sync_attempts: job.attempts,
      provider_sync_error: null,
    })
    .eq("id", booking.id)
    .eq("user_id", booking.user_id)
  if (processingError) throw new Error(processingError.message)

  await insertAudit(admin, job, "provider_sync_started", {
    attempt: job.attempts,
    provider: "google_calendar",
  })

  const googleEvent = await pushBookingToGoogle(admin, booking.user_id, {
    bookingUid: booking.uid,
    eventId,
    calendarId: snapshot.destinationCalendarId,
    title: booking.title,
    description: booking.description,
    start: booking.start_time,
    end: booking.end_time,
    timezone: booking.timezone ?? snapshot.timezone,
    location: createGoogleMeet ? null : location.value ?? booking.location,
    attendees: attendees.map((attendee) => ({
      email: attendee.email,
      displayName: attendee.name,
    })),
    createGoogleMeet,
    conferenceRequestId: `${eventId}m${job.attempts.toString(16)}`,
  })
  if (!googleEvent) throw new Error("Google Calendar is not connected")

  if (!(await bookingIsStillConfirmed(admin, booking.id))) {
    await removeBookingFromGoogle(
      admin,
      booking.user_id,
      snapshot.destinationCalendarId,
      googleEvent.eventId
    )
    await insertAudit(admin, job, "provider_sync_succeeded", {
      attempt: job.attempts,
      provider: "google_calendar",
      operation: "remove_stale_create",
      externalEventId: googleEvent.eventId,
    })
    return
  }

  const { error: calendarReferenceError } = await admin
    .from("booking_references")
    .upsert(
      {
        booking_id: booking.id,
        provider: "google_calendar",
        reference_type: "calendar_event",
        external_id: googleEvent.eventId,
        external_calendar_id: snapshot.destinationCalendarId,
        status: "active",
        metadata: {
          htmlLink: googleEvent.htmlLink,
          etag: googleEvent.etag,
        },
      },
      {
        onConflict: "booking_id,provider,reference_type,external_id",
      }
    )
  if (calendarReferenceError) throw new Error(calendarReferenceError.message)

  if (booking.event_id) {
    const { error: eventUpdateError } = await admin
      .from("events")
      .update({
        google_event_id: googleEvent.eventId,
        google_calendar_id: snapshot.destinationCalendarId,
        etag: googleEvent.etag,
        location: googleEvent.meetingUrl ?? booking.location,
      })
      .eq("id", booking.event_id)
      .eq("user_id", booking.user_id)
    if (eventUpdateError) throw new Error(eventUpdateError.message)
  }

  if (createGoogleMeet && !googleEvent.meetingUrl) {
    const state = googleEvent.conferenceStatus ?? "pending"
    throw new Error(`Google Meet creation is ${state}`)
  }

  if (googleEvent.meetingUrl) {
    const { error: meetingReferenceError } = await admin
      .from("booking_references")
      .upsert(
        {
          booking_id: booking.id,
          provider: "google_meet",
          reference_type: "video_meeting",
          external_id: googleEvent.conferenceId ?? googleEvent.eventId,
          meeting_url: googleEvent.meetingUrl,
          status: "active",
          metadata: {},
        },
        {
          onConflict: "booking_id,provider,reference_type,external_id",
        }
      )
    if (meetingReferenceError) throw new Error(meetingReferenceError.message)
  }

  const { error: bookingUpdateError } = await admin
    .from("bookings")
    .update({
      provider_sync_status: "synced",
      provider_sync_attempts: job.attempts,
      provider_sync_error: null,
      provider_synced_at: new Date().toISOString(),
    })
    .eq("id", booking.id)
    .eq("user_id", booking.user_id)
  if (bookingUpdateError) throw new Error(bookingUpdateError.message)

  await insertAudit(admin, job, "provider_sync_succeeded", {
    attempt: job.attempts,
    provider: "google_calendar",
    externalEventId: googleEvent.eventId,
  })
}

async function syncCancelledBooking(
  admin: SupabaseClient,
  job: SchedulingOutboxJob
) {
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, user_id, status")
    .eq("id", job.booking_id)
    .single()
  if (bookingError || !booking) {
    throw new Error(bookingError?.message ?? "Booking not found")
  }
  if (booking.status !== "cancelled") return

  const { data: reference, error: referenceError } = await admin
    .from("booking_references")
    .select("id, external_id, external_calendar_id")
    .eq("booking_id", booking.id)
    .eq("provider", "google_calendar")
    .eq("reference_type", "calendar_event")
    .eq("status", "active")
    .maybeSingle()
  if (referenceError) throw new Error(referenceError.message)
  if (!reference) {
    await admin
      .from("bookings")
      .update({
        provider_sync_status: "synced",
        provider_sync_attempts: job.attempts,
        provider_sync_error: null,
        provider_synced_at: new Date().toISOString(),
      })
      .eq("id", booking.id)
      .eq("user_id", booking.user_id)
    return
  }

  const { error: processingError } = await admin
    .from("bookings")
    .update({
      provider_sync_status: "processing",
      provider_sync_attempts: job.attempts,
      provider_sync_error: null,
    })
    .eq("id", booking.id)
    .eq("user_id", booking.user_id)
  if (processingError) throw new Error(processingError.message)

  await insertAudit(admin, job, "provider_sync_started", {
    attempt: job.attempts,
    provider: "google_calendar",
    operation: "delete",
  })

  const removed = await removeBookingFromGoogle(
    admin,
    booking.user_id,
    reference.external_calendar_id ?? "primary",
    reference.external_id
  )
  if (!removed) throw new Error("Google Calendar is not connected")

  const { error: referenceUpdateError } = await admin
    .from("booking_references")
    .update({ status: "deleted" })
    .eq("booking_id", booking.id)
    .eq("provider", "google_calendar")
  if (referenceUpdateError) throw new Error(referenceUpdateError.message)

  const { error: bookingUpdateError } = await admin
    .from("bookings")
    .update({
      provider_sync_status: "synced",
      provider_sync_attempts: job.attempts,
      provider_sync_error: null,
      provider_synced_at: new Date().toISOString(),
    })
    .eq("id", booking.id)
    .eq("user_id", booking.user_id)
  if (bookingUpdateError) throw new Error(bookingUpdateError.message)

  await insertAudit(admin, job, "provider_sync_succeeded", {
    attempt: job.attempts,
    provider: "google_calendar",
    operation: "delete",
    externalEventId: reference.external_id,
  })
}

async function syncRescheduledBooking(
  admin: SupabaseClient,
  job: SchedulingOutboxJob
) {
  const { booking, attendees } = await loadBookingProjection(admin, job)
  if (booking.status === "pending") return
  if (booking.status !== "confirmed") return
  if (!booking.rescheduled_from_id) {
    await syncConfirmedBooking(admin, job)
    return
  }

  const { data: previousReference, error: referenceError } = await admin
    .from("booking_references")
    .select("id, external_id, external_calendar_id")
    .eq("booking_id", booking.rescheduled_from_id)
    .eq("provider", "google_calendar")
    .eq("reference_type", "calendar_event")
    .eq("status", "active")
    .maybeSingle()
  if (referenceError) throw new Error(referenceError.message)
  if (!previousReference) {
    await syncConfirmedBooking(admin, job)
    return
  }

  const snapshot = eventTypeSnapshotSchema.parse(booking.event_type_snapshot)
  const location = snapshot.locations[0]
  const createGoogleMeet = location.type === "google_meet"

  const { error: processingError } = await admin
    .from("bookings")
    .update({
      provider_sync_status: "processing",
      provider_sync_attempts: job.attempts,
      provider_sync_error: null,
    })
    .eq("id", booking.id)
    .eq("user_id", booking.user_id)
  if (processingError) throw new Error(processingError.message)

  await insertAudit(admin, job, "provider_sync_started", {
    attempt: job.attempts,
    provider: "google_calendar",
    operation: "reschedule",
  })

  const googleEvent = await rescheduleBookingOnGoogle(admin, booking.user_id, {
    bookingUid: booking.uid,
    eventId: previousReference.external_id,
    calendarId:
      previousReference.external_calendar_id ?? snapshot.destinationCalendarId,
    title: booking.title,
    description: booking.description,
    start: booking.start_time,
    end: booking.end_time,
    timezone: booking.timezone ?? snapshot.timezone,
    location: createGoogleMeet ? null : location.value ?? booking.location,
    attendees: attendees.map((attendee) => ({
      email: attendee.email,
      displayName: attendee.name,
    })),
    createGoogleMeet,
    conferenceRequestId: `${bookingGoogleEventId(booking.uid)}m${job.attempts.toString(16)}`,
  })
  if (!googleEvent) throw new Error("Google Calendar is not connected")

  if (!(await bookingIsStillConfirmed(admin, booking.id))) {
    await removeBookingFromGoogle(
      admin,
      booking.user_id,
      previousReference.external_calendar_id ?? snapshot.destinationCalendarId,
      googleEvent.eventId
    )
    await insertAudit(admin, job, "provider_sync_succeeded", {
      attempt: job.attempts,
      provider: "google_calendar",
      operation: "remove_stale_reschedule",
      externalEventId: googleEvent.eventId,
    })
    return
  }

  const { error: calendarReferenceError } = await admin
    .from("booking_references")
    .upsert(
      {
        booking_id: booking.id,
        provider: "google_calendar",
        reference_type: "calendar_event",
        external_id: googleEvent.eventId,
        external_calendar_id:
          previousReference.external_calendar_id ??
          snapshot.destinationCalendarId,
        status: "active",
        metadata: {
          htmlLink: googleEvent.htmlLink,
          etag: googleEvent.etag,
        },
      },
      { onConflict: "booking_id,provider,reference_type,external_id" }
    )
  if (calendarReferenceError) throw new Error(calendarReferenceError.message)

  if (booking.event_id) {
    const { error: eventUpdateError } = await admin
      .from("events")
      .update({
        google_event_id: googleEvent.eventId,
        google_calendar_id:
          previousReference.external_calendar_id ??
          snapshot.destinationCalendarId,
        etag: googleEvent.etag,
        location: googleEvent.meetingUrl ?? booking.location,
      })
      .eq("id", booking.event_id)
      .eq("user_id", booking.user_id)
    if (eventUpdateError) throw new Error(eventUpdateError.message)
  }

  if (createGoogleMeet && !googleEvent.meetingUrl) {
    const state = googleEvent.conferenceStatus ?? "pending"
    throw new Error(`Google Meet creation is ${state}`)
  }

  if (googleEvent.meetingUrl) {
    const { error: meetingReferenceError } = await admin
      .from("booking_references")
      .upsert(
        {
          booking_id: booking.id,
          provider: "google_meet",
          reference_type: "video_meeting",
          external_id: googleEvent.conferenceId ?? googleEvent.eventId,
          meeting_url: googleEvent.meetingUrl,
          status: "active",
          metadata: {},
        },
        { onConflict: "booking_id,provider,reference_type,external_id" }
      )
    if (meetingReferenceError) throw new Error(meetingReferenceError.message)
  }

  const { error: oldReferenceError } = await admin
    .from("booking_references")
    .update({ status: "deleted" })
    .eq("booking_id", booking.rescheduled_from_id)
    .in("provider", ["google_calendar", "google_meet"])
  if (oldReferenceError) throw new Error(oldReferenceError.message)

  const { error: bookingUpdateError } = await admin
    .from("bookings")
    .update({
      provider_sync_status: "synced",
      provider_sync_attempts: job.attempts,
      provider_sync_error: null,
      provider_synced_at: new Date().toISOString(),
    })
    .eq("id", booking.id)
    .eq("user_id", booking.user_id)
  if (bookingUpdateError) throw new Error(bookingUpdateError.message)

  await insertAudit(admin, job, "provider_sync_succeeded", {
    attempt: job.attempts,
    provider: "google_calendar",
    operation: "reschedule",
    externalEventId: googleEvent.eventId,
  })
}

async function dispatchJob(admin: SupabaseClient, job: SchedulingOutboxJob) {
  switch (job.event_type) {
    case "booking.created":
    case "booking.confirmed":
      await syncConfirmedBooking(admin, job)
      return
    case "booking.rescheduled":
      await syncRescheduledBooking(admin, job)
      return
    case "booking.rejected":
      return
    case "booking.cancelled":
      await syncCancelledBooking(admin, job)
      return
  }
}

async function recordFailure(
  admin: SupabaseClient,
  job: SchedulingOutboxJob,
  error: unknown
) {
  const message = messageFrom(error)
  await admin
    .from("bookings")
    .update({
      provider_sync_status: "failed",
      provider_sync_attempts: job.attempts,
      provider_sync_error: message,
    })
    .eq("id", job.booking_id)
    .eq("user_id", job.user_id)

  try {
    await insertAudit(admin, job, "provider_sync_failed", {
      attempt: job.attempts,
      provider: "google_calendar",
      error: message,
    })
  } catch {
    // The outbox failure remains authoritative if audit logging also fails.
  }

  const { error: failError } = await admin.rpc("fail_scheduling_outbox", {
    p_id: job.id,
    p_lease_token: job.lease_token,
    p_error: message,
    p_available_at: retryAt(job.attempts),
  })
  if (failError) throw new Error(failError.message)
}

export async function processSchedulingOutbox({
  limit = 5,
}: {
  limit?: number
} = {}): Promise<SchedulingOutboxResult> {
  const admin = await createAdminClient()
  const { data, error } = await admin.rpc("claim_scheduling_outbox", {
    p_limit: Math.max(1, Math.min(50, Math.floor(limit))),
    p_lease_timeout: "5 minutes",
  })
  if (error) throw new Error(error.message)

  const jobs = (data ?? []) as SchedulingOutboxJob[]
  const result: SchedulingOutboxResult = {
    claimed: jobs.length,
    completed: 0,
    failed: 0,
    stale: 0,
  }

  for (const job of jobs) {
    if (!job.lease_token) {
      result.stale++
      continue
    }

    try {
      await dispatchJob(admin, job)
      const { data: completed, error: completeError } = await admin.rpc(
        "complete_scheduling_outbox",
        { p_id: job.id, p_lease_token: job.lease_token }
      )
      if (completeError) throw new Error(completeError.message)
      if (completed) result.completed++
      else result.stale++
    } catch (jobError) {
      await recordFailure(admin, job, jobError)
      result.failed++
    }
  }

  return result
}