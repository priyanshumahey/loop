"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react"

interface AutoformatContextValue {
  isAutoformatEnabled: boolean
  toggleAutoformat: () => void
  isEnabled: () => boolean
}

const AutoformatContext = createContext<AutoformatContextValue | null>(null)
const autoformatState = new Map<string, boolean>()

export function AutoformatProvider({ children }: { children: ReactNode }) {
  const providerId = useId()
  const [isAutoformatEnabled, setIsAutoformatEnabled] = useState(true)

  const toggleAutoformat = useCallback(() => {
    setIsAutoformatEnabled((current) => {
      const next = !current
      autoformatState.set(providerId, next)
      return next
    })
  }, [providerId])
  const isEnabled = useCallback(
    () => autoformatState.get(providerId) ?? true,
    [providerId]
  )

  useEffect(() => {
    return () => {
      autoformatState.delete(providerId)
    }
  }, [providerId])

  const value = useMemo(
    () => ({ isAutoformatEnabled, toggleAutoformat, isEnabled }),
    [isAutoformatEnabled, isEnabled, toggleAutoformat]
  )

  return (
    <AutoformatContext.Provider value={value}>
      {children}
    </AutoformatContext.Provider>
  )
}

export function useAutoformat() {
  const context = useContext(AutoformatContext)
  if (!context) {
    throw new Error("useAutoformat must be used within AutoformatProvider")
  }
  return context
}
