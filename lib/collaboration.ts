"use client"

import { createClient } from "@/lib/supabase/client"

const CURSOR_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#4f46e5",
] as const

function hashString(value: string): number {
  let hash = 0
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0
  }
  return Math.abs(hash)
}

export function cursorColorForUser(userId: string): string {
  return CURSOR_COLORS[hashString(userId) % CURSOR_COLORS.length]
}

export function getCollaborationUrl(): string {
  const configured = process.env.NEXT_PUBLIC_HOCUSPOCUS_URL?.trim()
  if (configured) return configured
  if (typeof window === "undefined") return "ws://localhost:8888"
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.hostname}:8888`
}

export async function getCollaborationToken(): Promise<string> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) return data.session.access_token
  const refreshed = await supabase.auth.refreshSession()
  if (!refreshed.data.session?.access_token) {
    throw new Error("Your session expired. Sign in again to collaborate.")
  }
  return refreshed.data.session.access_token
}
