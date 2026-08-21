import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { isoDateTimeSchema } from "@/lib/api/route-schemas"
import { getPublicScheduleSlots } from "@/lib/db/scheduling"
import {
  refreshHostAvailability,
  SLOT_BROWSE_MAX_AGE_SECONDS,
} from "@/lib/scheduling/availability"

const MAX_RANGE_MS = 31 * 86_400_000

const rangeSchema = z
  .object({ start: isoDateTimeSchema, end: isoDateTimeSchema })
  .refine(
    ({ start, end }) =>
      end > start && end.getTime() - start.getTime() <= MAX_RANGE_MS
  )

/**
 * Anonymous slot lookup for a public booking page. Errors stay generic so an
 * unauthenticated caller can't probe the database through them.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const parsed = rangeSchema.safeParse({
    start: request.nextUrl.searchParams.get("start"),
    end: request.nextUrl.searchParams.get("end"),
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid range up to 31 days is required" },
      { status: 400 }
    )
  }

  await refreshHostAvailability({
    slug,
    start: parsed.data.start,
    end: parsed.data.end,
    maxAgeSeconds: SLOT_BROWSE_MAX_AGE_SECONDS,
  })

  const result = await getPublicScheduleSlots(slug, parsed.data.start, parsed.data.end)
  if (!result.success) {
    return NextResponse.json(
      { error: "Unable to load available times" },
      { status: 500 }
    )
  }
  return NextResponse.json({
    data: result.data.map((slot) => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
    })),
  })
}
