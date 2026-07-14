"use client"

import { useEffect, useState } from "react"

/**
 * Like `useState`, but persisted to `localStorage` under `key` so the value
 * survives reloads and page navigations.
 *
 * SSR-safe: it renders with `defaultValue` on the server and first client
 * paint (so markup matches), then hydrates from storage on mount. The returned
 * `hydrated` flag lets callers defer rendering until the stored value is known,
 * avoiding a visible flash for things like collapsed panels.
 */
export function usePersistentState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue)
  const [hydrated, setHydrated] = useState(false)

  // Read the stored value once, after mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) setValue(JSON.parse(raw) as T)
    } catch {
      // ignore malformed/unavailable storage
    }
    setHydrated(true)
  }, [key])

  // Persist on change, but only after we've read the initial value.
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore quota/availability errors
    }
  }, [key, value, hydrated])

  return [value, setValue, hydrated] as const
}
