import { createClient } from "@/lib/supabase/server"

/** The result shape every `lib/db` service function returns. */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * The signed-in user plus an RLS-scoped Supabase client, or null when the
 * request isn't authenticated. Every owner-scoped service starts here.
 */
export async function currentUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return error || !user ? null : { supabase, user }
}
