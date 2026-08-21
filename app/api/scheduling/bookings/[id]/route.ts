import { after, NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { serviceErrorStatus } from "@/lib/api/route-schemas"
import { manageSchedulingBooking } from "@/lib/db/scheduling"
import { processSchedulingOutbox } from "@/lib/scheduling/outbox"

export const maxDuration = 60

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = z
    .object({
      action: z.enum(["confirm", "reject", "cancel"]),
      reason: z.string().trim().max(1000).optional(),
    })
    .safeParse(body)
  if (!z.uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: "Invalid booking action" }, { status: 400 })
  }

  const result = await manageSchedulingBooking({
    bookingId: id,
    action: parsed.data.action,
    reason: parsed.data.reason,
  })
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }

  after(async () => {
    try {
      await processSchedulingOutbox({ limit: 1 })
    } catch (error) {
      console.error("Failed to start host booking sync", error)
    }
  })

  return NextResponse.json({ data: result.data })
}