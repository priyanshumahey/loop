import type {
  AvailabilityRangeAction,
  AvailabilitySlot,
} from "@/components/scheduling/types"
import { currentUser, type ServiceResult } from "@/lib/db/service"

interface DbAvailabilitySlot {
  id: string
  start_time: string
  end_time: string
  event_type_id: string | null
}

function fromDb(row: DbAvailabilitySlot): AvailabilitySlot {
  return {
    id: row.id,
    start: new Date(row.start_time),
    end: new Date(row.end_time),
    eventTypeId: row.event_type_id,
  }
}

export async function getAvailability(
  startDate: Date,
  endDate: Date
): Promise<ServiceResult<AvailabilitySlot[]>> {
  try {
    const auth = await currentUser()
    if (!auth) return { success: false, error: "Unauthorized" }

    const { data, error } = await auth.supabase.rpc("get_scheduling_availability", {
      p_start_time: startDate.toISOString(),
      p_end_time: endDate.toISOString(),
    })

    if (error) return { success: false, error: error.message }
    return {
      success: true,
      data: ((data ?? []) as DbAvailabilitySlot[]).map(fromDb),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function setAvailabilityRange(
  start: Date,
  end: Date,
  action: AvailabilityRangeAction,
  eventTypeId: string | null
): Promise<ServiceResult<null>> {
  try {
    const auth = await currentUser()
    if (!auth) return { success: false, error: "Unauthorized" }

    const { error } = await auth.supabase.rpc("set_availability_range", {
      p_start_time: start.toISOString(),
      p_end_time: end.toISOString(),
      p_open: action === "open",
      p_event_type_id: eventTypeId,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, data: null }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
