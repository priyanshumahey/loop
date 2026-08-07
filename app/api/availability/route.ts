import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import type { AvailabilitySlot } from "@/components/scheduling/types"
import { isoDateTimeSchema, serviceErrorStatus } from "@/lib/api/route-schemas"
import { getAvailability, setAvailabilityRange } from "@/lib/db/availability"

const rangeSchema = z
  .object({ start: isoDateTimeSchema, end: isoDateTimeSchema })
  .refine(({ start, end }) => end > start, {
    message: "end must be after start",
  })

const mutationSchema = rangeSchema.and(
  z.object({
    action: z.enum(["open", "close"]),
    eventTypeId: z.uuid().nullable(),
  })
)

function serialize(slot: AvailabilitySlot) {
  return {
    ...slot,
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
  }
}

export async function GET(request: NextRequest) {
  const parsed = rangeSchema.safeParse({
    start: request.nextUrl.searchParams.get("start"),
    end: request.nextUrl.searchParams.get("end"),
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid start and end are required" },
      { status: 400 }
    )
  }

  const result = await getAvailability(parsed.data.start, parsed.data.end)
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data.map(serialize) })
}

export async function PUT(request: NextRequest) {
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid start, end, and action are required" },
      { status: 400 }
    )
  }

  const result = await setAvailabilityRange(
    parsed.data.start,
    parsed.data.end,
    parsed.data.action,
    parsed.data.eventTypeId
  )
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: null })
}
