import type {
  SchedulingColor,
  SchedulingEventType,
  WeeklyAvailabilityRule,
} from "@/components/scheduling/types"
import type { ApiResponse } from "@/lib/api/types"

export interface EventTypeInput {
  id?: string
  title: string
  slug: string
  description: string | null
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  minNoticeMinutes: number
  bookingWindowDays: number
  slotIncrementMinutes: number
  location: string | null
  color: SchedulingColor
  active: boolean
  timezone: string
  weeklyAvailability: WeeklyAvailabilityRule[]
}

export async function fetchEventTypes(): Promise<SchedulingEventType[]> {
  const response = await fetch("/api/scheduling/event-types")
  const result: ApiResponse<SchedulingEventType[]> = await response.json()
  if (!response.ok) throw new Error(result.error || "Failed to load meeting types")
  return result.data ?? []
}

export async function saveEventType(
  input: EventTypeInput
): Promise<SchedulingEventType> {
  const response = await fetch("/api/scheduling/event-types", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const result: ApiResponse<SchedulingEventType> = await response.json()
  if (!response.ok) throw new Error(result.error || "Failed to save meeting type")
  return result.data!
}

export async function deleteEventType(id: string): Promise<void> {
  const response = await fetch(`/api/scheduling/event-types/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    const result: ApiResponse<never> = await response.json()
    throw new Error(result.error || "Failed to delete meeting type")
  }
}
