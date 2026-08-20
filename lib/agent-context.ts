export type AgentContextEvent = {
  id: string
  title: string
  start: string
  end: string
  allDay?: boolean
  location?: string
  color?: string
}

export type AgentContextEmail = {
  id: string
  threadId: string
  from: string
  subject: string
  date: string
  snippet: string
}

export type AgentContextDocument = {
  id: string
  title: string
  updatedAt: string
  preview: string
}

export type AgentContextItem =
  | { type: "event"; event: AgentContextEvent }
  | { type: "email"; email: AgentContextEmail }
  | { type: "document"; document: AgentContextDocument }

export type AgentContextMetadata = {
  contextEvents?: AgentContextEvent[]
  contextEmails?: AgentContextEmail[]
  contextDocuments?: AgentContextDocument[]
}

export function agentContextItemKey(item: AgentContextItem): string {
  if (item.type === "event") return `event:${item.event.id}`
  if (item.type === "email") return `email:${item.email.id}`
  return `document:${item.document.id}`
}

export function agentContextItemLabel(item: AgentContextItem): string {
  if (item.type === "event") return item.event.title
  if (item.type === "email") return item.email.subject || "(no subject)"
  return item.document.title || "Untitled document"
}

export function agentContextMetadata(
  items: AgentContextItem[]
): AgentContextMetadata | undefined {
  const contextEvents = items
    .filter((item): item is Extract<AgentContextItem, { type: "event" }> =>
      item.type === "event"
    )
    .map((item) => item.event)
  const contextEmails = items
    .filter((item): item is Extract<AgentContextItem, { type: "email" }> =>
      item.type === "email"
    )
    .map((item) => item.email)
  const contextDocuments = items
    .filter((item): item is Extract<AgentContextItem, { type: "document" }> =>
      item.type === "document"
    )
    .map((item) => item.document)

  if (!contextEvents.length && !contextEmails.length && !contextDocuments.length) {
    return undefined
  }

  return {
    ...(contextEvents.length ? { contextEvents } : {}),
    ...(contextEmails.length ? { contextEmails } : {}),
    ...(contextDocuments.length ? { contextDocuments } : {}),
  }
}