"use client"

import { YjsPlugin } from "@platejs/yjs/react"
import { usePluginOption } from "platejs/react"
import { useEffect, useState } from "react"

interface AwarenessState {
  data?: { name?: string; color?: string }
}

interface Collaborator {
  clientId: number
  name: string
  color: string
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s@.]+/).filter(Boolean)
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function CollaboratorAvatars() {
  const awareness = usePluginOption(YjsPlugin, "awareness")
  const [users, setUsers] = useState<Collaborator[]>([])

  useEffect(() => {
    if (!awareness) return
    const sync = () => {
      const next: Collaborator[] = []
      awareness.getStates().forEach((rawState, clientId) => {
        const state = rawState as AwarenessState
        if (!state.data?.name || !state.data.color) return
        next.push({
          clientId,
          name: state.data.name,
          color: state.data.color,
        })
      })
      setUsers(next)
    }
    sync()
    awareness.on("change", sync)
    return () => awareness.off("change", sync)
  }, [awareness])

  if (!users.length) return null
  const visible = users.slice(0, 4)
  const overflow = users.length - visible.length

  return (
    <div className="flex items-center -space-x-1.5" aria-label={`${users.length} active collaborator${users.length === 1 ? "" : "s"}`}>
      {visible.map((user) => (
        <span
          key={user.clientId}
          title={user.name}
          className="relative grid size-7 place-items-center rounded-full border-2 border-surface text-[9px] font-medium text-white shadow-sm transition-transform hover:z-10 hover:scale-105"
          style={{ backgroundColor: user.color }}
        >
          {initials(user.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="relative grid size-7 place-items-center rounded-full border-2 border-surface bg-field text-[9px] font-medium text-ink-3">
          +{overflow}
        </span>
      )}
    </div>
  )
}