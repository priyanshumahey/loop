import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { serviceErrorStatus } from "@/lib/api/route-schemas"
import { getSchedulingBookings } from "@/lib/db/scheduling"

export async function GET(request: NextRequest) {
  const parsed = z
    .enum(["upcoming", "past", "all"])
    .default("upcoming")
    .safeParse(request.nextUrl.searchParams.get("scope") ?? undefined)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid booking scope" }, { status: 400 })
  }

  const result = await getSchedulingBookings({ scope: parsed.data })
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }

  return NextResponse.json({
    data: result.data.map((booking) => ({
      ...booking,
      start: booking.start.toISOString(),
      end: booking.end.toISOString(),
    })),
  })
}