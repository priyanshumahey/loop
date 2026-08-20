"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

interface LineNumbersContextValue {
  showLineNumbers: boolean
  toggleLineNumbers: () => void
}

const LineNumbersContext = createContext<LineNumbersContextValue | null>(null)

export function LineNumbersProvider({ children }: { children: ReactNode }) {
  const [showLineNumbers, setShowLineNumbers] = useState(false)

  return (
    <LineNumbersContext.Provider
      value={{
        showLineNumbers,
        toggleLineNumbers: () => setShowLineNumbers((current) => !current),
      }}
    >
      {children}
    </LineNumbersContext.Provider>
  )
}

export function useLineNumbers() {
  const context = useContext(LineNumbersContext)
  if (!context) {
    throw new Error("useLineNumbers must be used within LineNumbersProvider")
  }
  return context
}

export function useLineNumbersOptional(): boolean {
  return useContext(LineNumbersContext)?.showLineNumbers ?? false
}
