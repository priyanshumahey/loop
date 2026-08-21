import { after, NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { timeZoneSchema } from "@/lib/api/route-schemas"
import { reschedulePublicBooking } from "@/lib/db/scheduling"
import {
  BOOKING_COMMIT_MAX_AGE_SECONDS,
  bookingCollisionWindow,
  refreshHostAvailability,
} from "@/lib/scheduling/availability"
import { processSchedulingOutbox } from "@/lib/scheduling/outbox"

export const maxDuration = 60

const inputSchema = z.object({
  managementToken: z.string().min(32).max(256),
  start: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  requestId: z.uuid(),
  guestTimeZone: timeZoneSchema,
  guestLocale: z.string().trim().min(2).max(35).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = inputSchema.safeParse(body)
  if (!z.uuid().safeParse(uid).success || !parsed.success) {
    return NextResponse.json(
      { error: "Valid rescheduling details are required" },
      { status: 400 }
    )
  }

  const collisionWindow = bookingCollisionWindow(parsed.data.start)
  await refreshHostAvailability({
    bookingUid: uid,
    start: collisionWindow.start,
    end: collisionWindow.end,
    maxAgeSeconds: BOOKING_COMMIT_MAX_AGE_SECONDS,
  })

  const result = await reschedulePublicBooking({ uid, ...parsed.data })
  if (!result.success) {
    const status =
      result.error === "Booking not found" || result.error === "Schedule not found"
        ? 404
        : result.error === "This time is no longer available"
          ? 409
          : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  after(async () => {
    try {
      await processSchedulingOutbox({ limit: 1 })
    } catch (error) {
      console.error("Failed to start booking reschedule sync", error)
    }
  })

  return NextResponse.json(
    {
      data: {
        bookingId: result.data.bookingId,
        bookingUid: result.data.bookingUid,
        managementToken: result.data.managementToken,
        eventId: result.data.eventId,
        start: parsed.data.start.toISOString(),
        end: result.data.end.toISOString(),
        status: result.data.status,
      },
    },
    { status: 201 }
  )
}