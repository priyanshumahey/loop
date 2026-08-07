import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  calendarDateSchema,
  serviceErrorStatus,
  timeZoneSchema,
  weekdaysSchema,
} from "@/lib/api/route-schemas"
import { createCalendarShare, getCalendarShares } from "@/lib/db/calendar-shares"

const MAX_SHARE_DAYS = 365

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    view: z.enum(["week", "month", "agenda"]),
    showEventNames: z.boolean(),
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    visibleWeekdays: weekdaysSchema,
    timezone: timeZoneSchema,
  })
  .refine(
    ({ startDate, endDate }) => {
      const days =
        (Date.parse(`${endDate}T00:00:00Z`) -
          Date.parse(`${startDate}T00:00:00Z`)) /
        86_400_000
      return days >= 0 && days <= MAX_SHARE_DAYS
    },
    { message: `Calendar range must span at most ${MAX_SHARE_DAYS} days` }
  )

export async function GET() {
  const result = await getCalendarShares()
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data })
}

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid calendar share" }, { status: 400 })
  }

  const result = await createCalendarShare(parsed.data)
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data }, { status: 201 })
}
