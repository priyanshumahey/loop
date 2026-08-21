import { after, NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  cancelPublicBooking,
  getPublicBooking,
} from "@/lib/db/scheduling"
import { processSchedulingOutbox } from "@/lib/scheduling/outbox"

export const maxDuration = 60

const uidSchema = z.uuid()
const managementTokenSchema = z.string().min(32).max(256)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params
  const parsedUid = uidSchema.safeParse(uid)
  const parsedToken = managementTokenSchema.safeParse(
    request.nextUrl.searchParams.get("token")
  )
  if (!parsedUid.success || !parsedToken.success) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }

  const result = await getPublicBooking(parsedUid.data, parsedToken.data)
  if (!result.success || !result.data) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  }
  return NextResponse.json({ data: result.data })
}

export async function DELETE(
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

  const parsed = z
    .object({
      managementToken: managementTokenSchema,
      reason: z.string().trim().max(1000).optional(),
    })
    .safeParse(body)
  if (!uidSchema.safeParse(uid).success || !parsed.success) {
    return NextResponse.json({ error: "Valid booking details are required" }, { status: 400 })
  }

  const result = await cancelPublicBooking({
    uid,
    managementToken: parsed.data.managementToken,
    reason: parsed.data.reason,
  })
  if (!result.success) {
    const status = result.error === "Booking not found" ? 404 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  after(async () => {
    try {
      await processSchedulingOutbox({ limit: 1 })
    } catch (error) {
      console.error("Failed to start booking cancellation sync", error)
    }
  })
  return NextResponse.json({ data: result.data })
}