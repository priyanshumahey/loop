import { z } from "zod"

/** An ISO-8601 datetime carrying an explicit offset, parsed to a `Date`. */
export const isoDateTimeSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))

/** A plain calendar date (`YYYY-MM-DD`), kept as a string. */
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** A day of the week, Sunday = 0, matching `Date.prototype.getDay()`. */
export const weekdaySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
])

/** A non-empty, duplicate-free set of weekdays. */
export const weekdaysSchema = z
  .array(weekdaySchema)
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, {
    message: "weekdays must be unique",
  })

/** An IANA timezone the runtime actually recognises. */
export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value })
      return true
    } catch {
      return false
    }
  }, "unknown timezone")

/**
 * Map a `ServiceResult` error onto an HTTP status. Everything that isn't an
 * auth failure or a uniqueness conflict is treated as a bad request.
 */
export function serviceErrorStatus(error: string): number {
  if (error === "Unauthorized") return 401
  if (error.includes("duplicate key")) return 409
  return 400
}
