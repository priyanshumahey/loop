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

const schedulingLocationSchema = z
  .object({
    type: z.enum(["google_meet", "link", "phone", "in_person"]),
    value: z.string().trim().max(500).optional(),
  })
  .refine(
    (location) => location.type === "google_meet" || Boolean(location.value),
    { message: "Location details are required" }
  )

const bookingFieldSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
    label: z.string().trim().min(1).max(120),
    type: z.enum([
      "text",
      "textarea",
      "phone",
      "number",
      "select",
      "multiselect",
      "checkbox",
      "radio",
      "url",
    ]),
    required: z.boolean().optional(),
    options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  })
  .refine(
    (field) =>
      !["select", "multiselect", "radio"].includes(field.type) ||
      Boolean(field.options?.length),
    { message: "Choice fields require options" }
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
  locations: z.array(schedulingLocationSchema).min(1).max(5),
  bookingFields: z
    .array(bookingFieldSchema)
    .max(20)
    .refine(
      (fields) => new Set(fields.map((field) => field.id)).size === fields.length
    ),
  requiresConfirmation: z.boolean(),
  disableCancelling: z.boolean(),
  disableRescheduling: z.boolean(),
  minimumRescheduleNoticeMinutes: z.number().int().min(0).max(43_200),
  destinationCalendarId: z.string().trim().min(1).max(1024),
  successRedirectUrl: z.url().max(2048).nullable().optional(),
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