import { KEYS, type TElement, type Value } from "platejs"
import type { PlateEditor } from "platejs/react"

import type {
  CalendarEvent,
  EventRecurrence,
} from "@/components/event-calendar/types"
import type { Email } from "@/lib/api/emails"

export const EVENT_EMBED_KEY = "event-embed"
export const EMAIL_EMBED_KEY = "email-embed"

export interface EventEmbedSnapshot {
  title: string
  start: string
  end: string
  allDay?: boolean
  location?: string
  color?: string
  description?: string
  timezone?: string
  recurrence?: EventRecurrence
}

export interface EmailEmbedAttachment {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}

export interface EmailEmbedSnapshot {
  from: string
  to?: string
  cc?: string
  subject: string
  date: string
  snippet: string
  threadId: string
  bodyPreview?: string
  labels?: string[]
  unread?: boolean
  hasAttachments?: boolean
  messageCount?: number
  attachments?: EmailEmbedAttachment[]
}

export type TEventEmbedElement = TElement & {
  type: typeof EVENT_EMBED_KEY
  eventId: string
  snapshot: EventEmbedSnapshot
}

export type TEmailEmbedElement = TElement & {
  type: typeof EMAIL_EMBED_KEY
  emailId: string
  snapshot: EmailEmbedSnapshot
}

export type TSourceEmbedElement = TEventEmbedElement | TEmailEmbedElement

function isBlankParagraph(editor: PlateEditor, node: unknown): boolean {
  return Boolean(
    node &&
      typeof node === "object" &&
      "type" in node &&
      node.type === editor.getType(KEYS.p) &&
      editor.api.isEmpty(node as TElement)
  )
}

export function insertSourceEmbed(
  editor: PlateEditor,
  node: TSourceEmbedElement,
  requestedIndex: number
): number {
  let index = Math.max(0, Math.min(requestedIndex, editor.children.length))

  if (
    index > 0 &&
    isBlankParagraph(editor, editor.children[index - 1])
  ) {
    index -= 1
  }

  const replacesBlank = isBlankParagraph(editor, editor.children[index])

  editor.tf.withoutNormalizing(() => {
    if (replacesBlank) editor.tf.removeNodes({ at: [index] })
    editor.tf.insertNodes(node, { at: [index] })

    const trailingIndex = index + 1
    if (!isBlankParagraph(editor, editor.children[trailingIndex])) {
      editor.tf.insertNodes<TElement>(
        { type: KEYS.p, children: [{ text: "" }] },
        { at: [trailingIndex] }
      )
    }

    const trailingStart = editor.api.start([trailingIndex])
    if (trailingStart) editor.tf.select(trailingStart)
  })

  return index
}

export function isEventEmbedElement(node: unknown): node is TEventEmbedElement {
  return Boolean(
    node &&
      typeof node === "object" &&
      "type" in node &&
      node.type === EVENT_EMBED_KEY &&
      "eventId" in node &&
      typeof node.eventId === "string" &&
      "snapshot" in node &&
      node.snapshot &&
      typeof node.snapshot === "object"
  )
}

export function isEmailEmbedElement(node: unknown): node is TEmailEmbedElement {
  return Boolean(
    node &&
      typeof node === "object" &&
      "type" in node &&
      node.type === EMAIL_EMBED_KEY &&
      "emailId" in node &&
      typeof node.emailId === "string" &&
      "snapshot" in node &&
      node.snapshot &&
      typeof node.snapshot === "object"
  )
}

export function toEventEmbedSnapshot(event: CalendarEvent): EventEmbedSnapshot {
  return {
    title: event.title || "Untitled event",
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    allDay: event.allDay,
    location: event.location,
    color: event.color,
    description: compactSourceText(event.description ?? "", 1_000) || undefined,
    timezone: event.timezone,
    recurrence: event.recurrence,
  }
}

export function toEmailEmbedSnapshot(email: Email): EmailEmbedSnapshot {
  const snippet = compactSourceText(email.snippet, 400)
  const bodyPreview = compactEmailBody(email.bodyText) || snippet
  return {
    from: email.from,
    to: email.to || undefined,
    cc: email.cc || undefined,
    subject: email.subject,
    date: email.date,
    snippet,
    threadId: email.threadId,
    bodyPreview: bodyPreview || undefined,
    labels: email.labels?.slice(0, 20),
    unread: email.unread,
    hasAttachments: email.hasAttachments,
    messageCount: email.messageCount,
    attachments: email.attachments
      ?.filter((attachment) => !attachment.inline)
      .slice(0, 8)
      .map(({ attachmentId, filename, mimeType, size }) => ({
        attachmentId,
        filename,
        mimeType,
        size,
      })),
  }
}

function compactEmailBody(value: string): string {
  const fresh = value
    .split(
      /\n\s*(?:On .+wrote:|-{2,}\s*Original Message\s*-{2,}|From:\s.+)/i
    )[0]
    .replace(/^>.*$/gm, "")
  return compactSourceText(fresh, 1_200)
}

/** Drop schema.org/JSON-LD payloads that senders inline alongside real body text. */
function stripStructuredData(value: string): string {
  let out = value
  for (let pass = 0; pass < 8; pass += 1) {
    const marker = out.search(/"@context"\s*:/)
    if (marker === -1) break

    let start = marker
    while (start > 0 && out[start] !== "{" && out[start] !== "[") start -= 1
    if (out[start] !== "{" && out[start] !== "[") break
    const enclosing = out.slice(0, start).search(/\[\s*$/)
    if (enclosing !== -1) start = enclosing

    let depth = 0
    let inString = false
    let escaped = false
    let end = -1
    for (let i = start; i < out.length; i += 1) {
      const char = out[i]
      if (inString) {
        if (escaped) escaped = false
        else if (char === "\\") escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') inString = true
      else if (char === "{" || char === "[") depth += 1
      else if (char === "}" || char === "]") {
        depth -= 1
        if (depth === 0) {
          end = i + 1
          break
        }
      }
    }

    out = end === -1 ? out.slice(0, start) : `${out.slice(0, start)} ${out.slice(end)}`
  }
  return out
}

function shortenUrls(value: string): string {
  return value.replace(/https?:\/\/[^\s<>"']{40,}/gi, (url) => {
    try {
      return `${new URL(url).hostname.replace(/^www\./, "")}/…`
    } catch {
      return url
    }
  })
}

function compactSourceText(value: string, maxLength: number): string {
  const plain = stripStructuredData(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|head|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  const readable = shortenUrls(plain)
  if (readable.length <= maxLength) return readable
  return `${readable.slice(0, maxLength - 1).trimEnd()}…`
}

export function embedNodeText(node: unknown): string | null {
  if (isEventEmbedElement(node)) {
    const { snapshot } = node
    return [
      `Calendar event: ${snapshot.title || "Untitled event"}`,
      snapshot.allDay
        ? `all day ${snapshot.start}`
        : `${snapshot.start} to ${snapshot.end}`,
      snapshot.location ? `at ${snapshot.location}` : null,
      snapshot.description,
    ]
      .filter(Boolean)
      .join("; ")
  }
  if (isEmailEmbedElement(node)) {
    const { snapshot } = node
    return [
      `Email: ${snapshot.subject || "(no subject)"}`,
      `from ${snapshot.from || "Unknown sender"}`,
      snapshot.date,
      snapshot.bodyPreview || snapshot.snippet,
      snapshot.to ? `to ${snapshot.to}` : null,
      snapshot.attachments?.length
        ? `${snapshot.attachments.length} attachment${snapshot.attachments.length === 1 ? "" : "s"}`
        : null,
    ]
      .filter(Boolean)
      .join("; ")
  }
  return null
}

function projectedEmbedParagraph(text: string, url: string): TElement {
  return {
    type: KEYS.p,
    children: [
      { text: `${text}. ` },
      {
        type: KEYS.link,
        url,
        children: [{ text: "Open in Loop" }],
      },
    ],
  }
}

/** Replace proprietary embed blocks with portable paragraphs for Markdown. */
export function projectEmbedsForMarkdown(value: Value): Value {
  return value.map((node) => {
    if (isEventEmbedElement(node)) {
      const params = new URLSearchParams({
        event: node.eventId,
        date: node.snapshot.start,
      })
      return projectedEmbedParagraph(
        embedNodeText(node) ?? "Calendar event",
        `/cal?${params.toString()}`
      )
    }
    if (isEmailEmbedElement(node)) {
      return projectedEmbedParagraph(
        embedNodeText(node) ?? "Email",
        `/mail?email=${encodeURIComponent(node.emailId)}`
      )
    }
    return node
  })
}