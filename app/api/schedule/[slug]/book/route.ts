import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { bookPublicSchedule } from "@/lib/db/scheduling"

const bookingSchema = z.object({
  start: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  guestName: z.string().trim().min(1).max(120),
  guestEmail: z.email().max(320),
  guestNotes: z.string().trim().max(1000).optional(),
  requestId: z.uuid(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = bookingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Valid booking details are required" }, { status: 400 })
  }

  const result = await bookPublicSchedule({ slug, ...parsed.data })
  if (!result.success) {
    const status =
      result.error === "This time is no longer available"
        ? 409
        : result.error === "Schedule not found"
          ? 404
          : 400
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json(
    {
      data: {
        bookingId: result.data.bookingId,
        eventId: result.data.eventId,
        start: parsed.data.start.toISOString(),
        end: result.data.end.toISOString(),
      },
    },
    { status: 201 }
  )
}