import type {
  AvailabilityRangeAction,
  AvailabilitySlot,
} from "@/components/scheduling/types"
import type { ApiResponse } from "@/lib/api/types"

const API_BASE = "/api/availability"

interface SerializedAvailabilitySlot {
  id: string
  start: string
  end: string
  eventTypeId: string | null
}

export async function fetchAvailability(
  start: Date,
  end: Date
): Promise<AvailabilitySlot[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  })
  const response = await fetch(`${API_BASE}?${params}`)
  const result: ApiResponse<SerializedAvailabilitySlot[]> = await response.json()
  if (!response.ok) throw new Error(result.error || "Failed to load availability")

  return (result.data ?? []).map((slot) => ({
    id: slot.id,
    start: new Date(slot.start),
    end: new Date(slot.end),
    eventTypeId: slot.eventTypeId,
  }))
}

export async function setAvailabilityRange(
  start: Date,
  end: Date,
  action: AvailabilityRangeAction,
  eventTypeId: string | null
) {
  const response = await fetch(API_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start: start.toISOString(),
      end: end.toISOString(),
      action,
      eventTypeId,
    }),
  })
  if (!response.ok) {
    const result: ApiResponse<never> = await response.json()
    throw new Error(result.error || "Failed to update availability")
  }
}
