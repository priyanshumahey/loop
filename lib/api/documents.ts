import type { Value } from "platejs"

import type { ApiResponse } from "@/lib/api/types"
import type {
  DocumentCreationMode,
  DocumentFolder,
  DocumentKind,
  DocumentRevision,
  DocumentRevisionSource,
  DocumentSummary,
  LoopDocument,
} from "@/lib/documents"

async function resultData<T>(response: Response, fallback: string): Promise<T> {
  const result: ApiResponse<T> = await response.json()
  if (!response.ok || result.data === undefined) {
    throw new Error(result.error || fallback)
  }
  return result.data
}

export async function fetchDocuments(options: {
  folderId?: string | null
  allFolders?: boolean
  kind?: DocumentKind
} = {}): Promise<DocumentSummary[]> {
  const params = new URLSearchParams()
  if (options.folderId) params.set("folder", options.folderId)
  if (options.allFolders) params.set("all", "1")
  if (options.kind) params.set("kind", options.kind)
  const response = await fetch(`/api/documents?${params.toString()}`)
  return resultData(response, "Failed to load documents")
}

export async function fetchDocument(id: string): Promise<LoopDocument> {
  const response = await fetch(`/api/documents/${id}`)
  return resultData(response, "Failed to load document")
}

export async function createDocument(input: {
  title: string
  content: Value
  folderId?: string | null
  kind?: DocumentKind
  creationMode?: DocumentCreationMode
}): Promise<LoopDocument> {
  const response = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return resultData(response, "Failed to create document")
}

export async function updateDocument(
  id: string,
  input: {
    title?: string
    content?: Value
    folderId?: string | null
    starred?: boolean
  }
): Promise<LoopDocument> {
  const response = await fetch(`/api/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return resultData(response, "Failed to save document")
}

export async function deleteDocument(id: string): Promise<void> {
  const response = await fetch(`/api/documents/${id}`, { method: "DELETE" })
  if (!response.ok) {
    const result: ApiResponse<never> = await response.json()
    throw new Error(result.error || "Failed to delete document")
  }
}

export async function fetchDocumentFolders(
  parentId?: string | null
): Promise<DocumentFolder[]> {
  const params = new URLSearchParams()
  if (parentId) params.set("parent", parentId)
  const response = await fetch(`/api/document-folders?${params.toString()}`)
  return resultData(response, "Failed to load folders")
}

export async function createDocumentFolder(input: {
  name: string
  parentId?: string | null
}): Promise<DocumentFolder> {
  const response = await fetch("/api/document-folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return resultData(response, "Failed to create folder")
}

export async function deleteDocumentFolder(id: string): Promise<void> {
  const response = await fetch(`/api/document-folders/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    const result: ApiResponse<never> = await response.json()
    throw new Error(result.error || "Failed to delete folder")
  }
}

export async function fetchDocumentRevisions(
  documentId: string
): Promise<DocumentRevision[]> {
  const response = await fetch(`/api/documents/${documentId}/revisions`)
  return resultData(response, "Failed to load document history")
}

export async function createDocumentCheckpoint(
  documentId: string,
  source: Extract<DocumentRevisionSource, "agent" | "restore" | "template">
): Promise<{ id: string }> {
  const response = await fetch(`/api/documents/${documentId}/revisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  })
  return resultData(response, "Failed to create document checkpoint")
}
