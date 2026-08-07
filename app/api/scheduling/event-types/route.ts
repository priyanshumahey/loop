import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  serviceErrorStatus,
  timeZoneSchema,
  weekdaySchema,
} from "@/lib/api/route-schemas"
import {
  getSchedulingEventTypes,
  saveSchedulingEventType,
} from "@/lib/db/scheduling"

const weeklyAvailabilitySchema = z
  .array(
    z
      .object({
        dayOfWeek: weekdaySchema,
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
      })
      .refine((rule) => rule.endMinute > rule.startMinute)
  )
  .max(7)
  .refine(
    (rules) => new Set(rules.map((rule) => rule.dayOfWeek)).size === rules.length
  )

const eventTypeSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(500).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(480),
  bufferBeforeMinutes: z.number().int().min(0).max(120),
  bufferAfterMinutes: z.number().int().min(0).max(120),
  minNoticeMinutes: z.number().int().min(0).max(43_200),
  bookingWindowDays: z.number().int().min(1).max(365),
  slotIncrementMinutes: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(60),
  ]),
  location: z.string().trim().max(200).nullable().optional(),
  color: z.enum(["sky", "amber", "violet", "rose", "emerald", "orange"]),
  active: z.boolean(),
  timezone: timeZoneSchema,
  weeklyAvailability: weeklyAvailabilitySchema,
})

export async function GET() {
  const result = await getSchedulingEventTypes()
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: serviceErrorStatus(result.error) })
  }
  return NextResponse.json({ data: result.data })
}

export async function PUT(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = eventTypeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 })
  }

  const result = await saveSchedulingEventType(parsed.data)
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: serviceErrorStatus(result.error) })
  }
  return NextResponse.json({ data: result.data })
}