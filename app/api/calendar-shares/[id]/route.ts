import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  calendarDateSchema,
  serviceErrorStatus,
  timeZoneSchema,
  weekdaysSchema,
} from "@/lib/api/route-schemas"
import {
  deleteCalendarShare,
  updateCalendarShare,
} from "@/lib/db/calendar-shares"

interface RouteParams {
  params: Promise<{ id: string }>
}

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    view: z.enum(["week", "month", "agenda"]).optional(),
    showEventNames: z.boolean().optional(),
    startDate: calendarDateSchema.optional(),
    endDate: calendarDateSchema.optional(),
    visibleWeekdays: weekdaysSchema.optional(),
    timezone: timeZoneSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field is required",
  })

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!z.uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: "Invalid calendar share" }, { status: 400 })
  }

  const result = await updateCalendarShare(id, parsed.data)
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data })
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid calendar share" }, { status: 400 })
  }

  const result = await deleteCalendarShare(id)
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return new NextResponse(null, { status: 204 })
}
