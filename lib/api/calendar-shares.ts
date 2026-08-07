import type { ApiResponse } from "@/lib/api/types"
import type {
  CalendarShare,
  CalendarShareView,
  CalendarShareWeekday,
} from "@/lib/db/calendar-shares"

const API_BASE = "/api/calendar-shares"

export interface CalendarShareInput {
  name: string
  view: CalendarShareView
  showEventNames: boolean
  startDate: string
  endDate: string
  visibleWeekdays: CalendarShareWeekday[]
  timezone: string
}

export type CalendarShareUpdate = Partial<CalendarShareInput & { active: boolean }>

async function unwrap<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>
  if (!response.ok || body.data === undefined) {
    throw new Error(body.error || fallback)
  }
  return body.data
}

export async function listCalendarShares(
  signal?: AbortSignal
): Promise<CalendarShare[]> {
  const response = await fetch(API_BASE, { signal })
  return unwrap<CalendarShare[]>(response, "Could not load links")
}

export async function createCalendarShare(
  input: CalendarShareInput
): Promise<CalendarShare> {
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return unwrap<CalendarShare>(response, "Could not create link")
}

export async function updateCalendarShare(
  id: string,
  updates: CalendarShareUpdate
): Promise<CalendarShare> {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  })
  return unwrap<CalendarShare>(response, "Could not update link")
}

export async function deleteCalendarShare(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${id}`, { method: "DELETE" })
  if (response.ok) return
  const body = (await response.json().catch(() => ({}))) as ApiResponse<never>
  throw new Error(body.error || "Could not delete link")
}
