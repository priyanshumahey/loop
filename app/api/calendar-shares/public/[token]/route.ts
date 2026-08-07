import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { isoDateTimeSchema } from "@/lib/api/route-schemas"
import {
  getPublicCalendarEvents,
  getPublicCalendarShare,
} from "@/lib/db/calendar-shares"

interface RouteParams {
  params: Promise<{ token: string }>
}

// Matches the 62-day window the `get_public_calendar_events` RPC enforces.
const MAX_RANGE_MS = 62 * 86_400_000

const rangeSchema = z
  .object({ start: isoDateTimeSchema, end: isoDateTimeSchema })
  .refine(
    ({ start, end }) =>
      end > start && end.getTime() - start.getTime() <= MAX_RANGE_MS
  )

/**
 * Anonymous read of a shared calendar. Errors are deliberately generic: this is
 * an unauthenticated endpoint, so it must not surface database detail.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { token } = await params
  const parsed = rangeSchema.safeParse({
    start: request.nextUrl.searchParams.get("start"),
    end: request.nextUrl.searchParams.get("end"),
  })
  if (!/^[a-f0-9]{32}$/.test(token) || !parsed.success) {
    return NextResponse.json({ error: "Invalid calendar range" }, { status: 400 })
  }

  const share = await getPublicCalendarShare(token)
  if (!share.success) {
    return NextResponse.json(
      { error: "Unable to load this calendar" },
      { status: 500 }
    )
  }
  if (!share.data) {
    return NextResponse.json({ error: "Calendar not found" }, { status: 404 })
  }

  const events = await getPublicCalendarEvents(
    token,
    parsed.data.start,
    parsed.data.end
  )
  if (!events.success) {
    return NextResponse.json(
      { error: "Unable to load this calendar" },
      { status: 500 }
    )
  }
  return NextResponse.json({
    data: events.data.map((event) => ({
      ...event,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
    })),
  })
}
