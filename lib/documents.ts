import type { Value } from "platejs"

import { embedNodeText } from "@/lib/document-embeds"

export type DocumentKind = "document" | "template"
export type DocumentCreationMode = "classic" | "agent"
export type DocumentRevisionSource = "user" | "agent" | "restore" | "template"
export type DocumentRole = "owner" | "editor" | "viewer"

export interface LoopDocument {
  id: string
  userId: string
  folderId: string | null
  title: string
  content: Value
  kind: DocumentKind
  creationMode: DocumentCreationMode
  role: DocumentRole
  starred: boolean
  createdAt: string
  updatedAt: string
}

export interface DocumentPreviewBlock {
  kind: "heading" | "paragraph" | "quote" | "list" | "code"
  text: string
  level?: number
  ordered?: boolean
}

export type DocumentSummary = Omit<LoopDocument, "content"> & {
  preview: DocumentPreviewBlock[]
}

export interface DocumentFolder {
  id: string
  userId: string
  parentId: string | null
  name: string
  createdAt: string
  updatedAt: string
}

export interface DocumentRevision {
  id: string
  documentId: string
  title: string
  content: Value
  source: DocumentRevisionSource
  createdBy: string | null
  createdAt: string
}

export interface StarterTemplate {
  id: string
  name: string
  description: string
  content: Value
}

export const EMPTY_DOCUMENT_VALUE: Value = [
  { type: "p", children: [{ text: "" }] },
]

const PREVIEW_BLOCK_LIMIT = 8
const PREVIEW_TEXT_LIMIT = 180

function nodeText(node: unknown): string {
  const embedded = embedNodeText(node)
  if (embedded) return embedded
  if (!node || typeof node !== "object") return ""
  if ("text" in node && typeof node.text === "string") return node.text
  if (!("children" in node) || !Array.isArray(node.children)) return ""
  return node.children.map(nodeText).join("")
}

function nodeType(node: unknown): string {
  if (!node || typeof node !== "object" || !("type" in node)) return ""
  return typeof node.type === "string" ? node.type : ""
}

export function createDocumentPreview(content: Value): DocumentPreviewBlock[] {
  const preview: DocumentPreviewBlock[] = []

  const addBlock = (node: unknown, parentType = "") => {
    if (preview.length >= PREVIEW_BLOCK_LIMIT) return
    const type = nodeType(node)

    if ((type === "ul" || type === "ol") && node && typeof node === "object") {
      if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children) addBlock(child, type)
      }
      return
    }

    const text = nodeText(node).replace(/\s+/g, " ").trim()
    if (!text) return
    const clippedText = text.slice(0, PREVIEW_TEXT_LIMIT)

    if (/^h[1-6]$/.test(type)) {
      preview.push({ kind: "heading", text: clippedText, level: Number(type[1]) })
    } else if (type === "blockquote") {
      preview.push({ kind: "quote", text: clippedText })
    } else if (type === "code_block" || type === "code-line") {
      preview.push({ kind: "code", text: clippedText })
    } else if (type === "li" || type === "lic" || parentType === "ul" || parentType === "ol") {
      preview.push({ kind: "list", text: clippedText, ordered: parentType === "ol" })
    } else {
      preview.push({ kind: "paragraph", text: clippedText })
    }
  }

  for (const node of content) addBlock(node)
  return preview
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "blank",
    name: "Blank page",
    description: "Start with a clean page",
    content: EMPTY_DOCUMENT_VALUE,
  },
  {
    id: "meeting-notes",
    name: "Meeting notes",
    description: "Decisions, discussion, and next steps",
    content: [
      { type: "h1", children: [{ text: "Meeting notes" }] },
      { type: "p", children: [{ text: "Date · Attendees" }] },
      { type: "h2", children: [{ text: "Discussion" }] },
      { type: "p", children: [{ text: "" }] },
      { type: "h2", children: [{ text: "Decisions" }] },
      { type: "p", children: [{ text: "" }] },
      { type: "h2", children: [{ text: "Next steps" }] },
      { type: "p", children: [{ text: "" }] },
    ],
  },
  {
    id: "project-brief",
    name: "Project brief",
    description: "Frame a project before work begins",
    content: [
      { type: "h1", children: [{ text: "Project brief" }] },
      { type: "h2", children: [{ text: "Objective" }] },
      { type: "p", children: [{ text: "What are we trying to change?" }] },
      { type: "h2", children: [{ text: "Context" }] },
      { type: "p", children: [{ text: "What should the team know?" }] },
      { type: "h2", children: [{ text: "Scope" }] },
      { type: "p", children: [{ text: "" }] },
      { type: "h2", children: [{ text: "Success looks like" }] },
      { type: "p", children: [{ text: "" }] },
    ],
  },
  {
    id: "weekly-plan",
    name: "Weekly plan",
    description: "Turn priorities into a focused week",
    content: [
      { type: "h1", children: [{ text: "Weekly plan" }] },
      { type: "blockquote", children: [{ type: "p", children: [{ text: "The one outcome that matters this week:" }] }] },
      { type: "h2", children: [{ text: "Priorities" }] },
      { type: "p", children: [{ text: "1. " }] },
      { type: "p", children: [{ text: "2. " }] },
      { type: "p", children: [{ text: "3. " }] },
      { type: "h2", children: [{ text: "Risks and blockers" }] },
      { type: "p", children: [{ text: "" }] },
    ],
  },
]
