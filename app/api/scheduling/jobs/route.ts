import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { processSchedulingOutbox } from "@/lib/scheduling/outbox"

export const maxDuration = 60

function authorized(request: NextRequest): boolean {
  const secret = process.env.SCHEDULING_WORKER_SECRET
  const header = request.headers.get("authorization")
  if (!secret || !header?.startsWith("Bearer ")) return false

  const provided = Buffer.from(header.slice(7))
  const expected = Buffer.from(secret)
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  )
}

export async function POST(request: NextRequest) {
  if (!process.env.SCHEDULING_WORKER_SECRET) {
    return NextResponse.json(
      { error: "Scheduling worker is not configured" },
      { status: 503 }
    )
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .safeParse(request.nextUrl.searchParams.get("limit") ?? undefined)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid job limit" }, { status: 400 })
  }

  try {
    return NextResponse.json({
      data: await processSchedulingOutbox({ limit: parsed.data }),
    })
  } catch (error) {
    console.error("Failed to process scheduling jobs", error)
    return NextResponse.json(
      { error: "Unable to process scheduling jobs" },
      { status: 500 }
    )
  }
}