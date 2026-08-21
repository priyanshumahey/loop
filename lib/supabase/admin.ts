import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

type LocalConfig = { apiUrl?: string; serviceRoleKey?: string }

// Shared promise so concurrent requests never spawn more than one discovery.
let localConfigPromise: Promise<LocalConfig> | null = null

async function readLocalSupabaseConfig(): Promise<LocalConfig> {
  try {
    const { stdout } = await execFileAsync(
      "supabase",
      ["status", "--output", "json"],
      { timeout: 10_000, encoding: "utf8" }
    )
    const status = JSON.parse(stdout) as {
      API_URL?: string
      SERVICE_ROLE_KEY?: string
    }
    return { apiUrl: status.API_URL, serviceRoleKey: status.SERVICE_ROLE_KEY }
  } catch {
    return {}
  }
}

function localSupabaseConfig(): Promise<LocalConfig> {
  if (process.env.NODE_ENV === "production") return Promise.resolve({})
  localConfigPromise ??= readLocalSupabaseConfig()
  return localConfigPromise
}

export async function createAdminClient(): Promise<SupabaseClient> {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const envServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const local = envUrl && envServiceRoleKey ? {} : await localSupabaseConfig()

  const url = envUrl ?? local.apiUrl
  const serviceRoleKey = envServiceRoleKey ?? local.serviceRoleKey
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Scheduling workers require NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}