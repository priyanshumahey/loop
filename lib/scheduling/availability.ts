import "server-only"

import { pullGoogleEvents } from "@/lib/google-sync"
import { createAdminClient } from "@/lib/supabase/admin"

/** Slot browsing tolerates slightly stale data; taking a slot never does. */
export const SLOT_BROWSE_MAX_AGE_SECONDS = 60
export const BOOKING_COMMIT_MAX_AGE_SECONDS = 0

const COMMIT_WINDOW_BEFORE_MS = 4 * 60 * 60 * 1000
const COMMIT_WINDOW_AFTER_MS = 8 * 60 * 60 * 1000

/**
 * Pull the host's provider calendar into the local busy projection that the
 * public slot and booking rules read. Anonymous visitors never trigger the
 * authenticated calendar sync, so without this a meeting booked directly in
 * Google would stay bookable in Loop.
 *
 * Best effort by design: a provider outage must not take public booking down,
 * and the booking transaction still enforces every rule against local state.
 */
export async function refreshHostAvailability(input: {
  slug?: string
  bookingUid?: string
  start: Date
  end: Date
  maxAgeSeconds: number
}): Promise<{ refreshed: boolean }> {
  try {
    const admin = await createAdminClient()

    const owner = input.slug
      ? await admin
          .from("scheduling_event_types")
          .select("user_id")
          .eq("slug", input.slug)
          .eq("active", true)
          .maybeSingle()
      : await admin
          .from("bookings")
          .select("user_id")
          .eq("uid", input.bookingUid ?? "")
          .maybeSingle()
    if (owner.error) throw new Error(owner.error.message)
    if (!owner.data) return { refreshed: false }

    const { data: claimed, error: claimError } = await admin.rpc(
      "claim_availability_sync",
      {
        p_user_id: owner.data.user_id,
        p_window_start: input.start.toISOString(),
        p_window_end: input.end.toISOString(),
        p_max_age: `${Math.max(0, Math.floor(input.maxAgeSeconds))} seconds`,
      }
    )
    if (claimError) throw new Error(claimError.message)
    if (!claimed) return { refreshed: false }

    const result = await pullGoogleEvents(
      admin,
      owner.data.user_id,
      input.start.toISOString(),
      input.end.toISOString()
    )
    return { refreshed: result.synced }
  } catch (error) {
    console.error("Failed to refresh host availability", error)
    return { refreshed: false }
  }
}

/** The window a single booking can collide with, including maximum buffers. */
export function bookingCollisionWindow(start: Date): { start: Date; end: Date } {
  return {
    start: new Date(start.getTime() - COMMIT_WINDOW_BEFORE_MS),
    end: new Date(start.getTime() + COMMIT_WINDOW_AFTER_MS),
  }
}
