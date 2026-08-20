import type { Value } from "platejs"

import {
  createDocumentPreview,
  type DocumentCreationMode,
  type DocumentFolder,
  type DocumentKind,
  type DocumentRole,
  type DocumentRevision,
  type DocumentRevisionSource,
  type DocumentSummary,
  type LoopDocument,
} from "@/lib/documents"
import { currentUser, type ServiceResult } from "@/lib/db/service"

interface DocumentRow {
  id: string
  user_id: string
  folder_id: string | null
  title: string
  content: Value
  kind: DocumentKind
  creation_mode: DocumentCreationMode
  starred: boolean
  created_at: string
  updated_at: string
}

type DocumentSummaryRow = Omit<DocumentRow, "content"> & {
  content?: Value
}

interface FolderRow {
  id: string
  user_id: string
  parent_id: string | null
  name: string
  created_at: string
  updated_at: string
}

interface RevisionRow {
  id: string
  document_id: string
  title: string
  content: Value
  source: DocumentRevisionSource
  created_by: string | null
  created_at: string
}

function toDocument(row: DocumentRow, role: DocumentRole): LoopDocument {
  return {
    id: row.id,
    userId: row.user_id,
    folderId: role === "owner" ? row.folder_id : null,
    title: row.title,
    content: row.content,
    kind: row.kind,
    creationMode: row.creation_mode,
    role,
    starred: row.starred,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toSummary(row: DocumentSummaryRow, role: DocumentRole): DocumentSummary {
  return {
    id: row.id,
    userId: row.user_id,
    folderId: role === "owner" ? row.folder_id : null,
    title: row.title,
    kind: row.kind,
    creationMode: row.creation_mode,
    role,
    starred: row.starred,
    preview: row.content ? createDocumentPreview(row.content) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function rolesForDocuments(
  auth: NonNullable<Awaited<ReturnType<typeof currentUser>>>,
  rows: { id: string; user_id: string }[]
): Promise<ServiceResult<Map<string, DocumentRole>>> {
  const roles = new Map<string, DocumentRole>()
  const sharedIds: string[] = []
  for (const row of rows) {
    if (row.user_id === auth.user.id) roles.set(row.id, "owner")
    else sharedIds.push(row.id)
  }
  if (!sharedIds.length) return { success: true, data: roles }

  const { data, error } = await auth.supabase
    .from("document_permissions")
    .select("document_id, role")
    .eq("user_id", auth.user.id)
    .in("document_id", sharedIds)
  if (error) return { success: false, error: error.message }
  for (const permission of data ?? []) {
    roles.set(permission.document_id, permission.role as DocumentRole)
  }
  return { success: true, data: roles }
}

function toFolder(row: FolderRow): DocumentFolder {
  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listDocuments(options: {
  folderId?: string | null
  kind?: DocumentKind
  allFolders?: boolean
  includePreview?: boolean
  limit?: number
  search?: string
} = {}): Promise<ServiceResult<DocumentSummary[]>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  let query = options.includePreview
    ? auth.supabase
        .from("documents")
        .select("id, user_id, folder_id, title, content, kind, creation_mode, starred, created_at, updated_at")
    : auth.supabase
        .from("documents")
        .select("id, user_id, folder_id, title, kind, creation_mode, starred, created_at, updated_at")

  query = query
    .eq("kind", options.kind ?? "document")
    .order("starred", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(options.limit ?? 100)

  if (!options.allFolders) {
    query = options.folderId
      ? query.eq("user_id", auth.user.id).eq("folder_id", options.folderId)
      : query.or(`folder_id.is.null,user_id.neq.${auth.user.id}`)
  }

  const search = options.search?.trim()
  if (search) query = query.ilike("title", `%${search}%`)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }
  const rows = (data ?? []) as DocumentSummaryRow[]
  const roles = await rolesForDocuments(auth, rows)
  if (!roles.success) return roles
  return {
    success: true,
    data: rows.flatMap((row) => {
      const role = roles.data.get(row.id)
      return role ? [toSummary(row, role)] : []
    }),
  }
}

export async function getDocument(id: string): Promise<ServiceResult<LoopDocument | null>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const { data, error } = await auth.supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: true, data: null }
  const roles = await rolesForDocuments(auth, [data as DocumentRow])
  if (!roles.success) return roles
  const role = roles.data.get(id)
  return {
    success: true,
    data: role ? toDocument(data as DocumentRow, role) : null,
  }
}

export async function createDocument(input: {
  title: string
  content: Value
  folderId?: string | null
  kind?: DocumentKind
  creationMode?: DocumentCreationMode
}): Promise<ServiceResult<LoopDocument>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const { data, error } = await auth.supabase
    .from("documents")
    .insert({
      user_id: auth.user.id,
      folder_id: input.folderId ?? null,
      title: input.title,
      content: input.content,
      kind: input.kind ?? "document",
      creation_mode: input.creationMode ?? "classic",
    })
    .select("*")
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, data: toDocument(data as DocumentRow, "owner") }
}

export async function updateDocument(input: {
  id: string
  title?: string
  content?: Value
  folderId?: string | null
  starred?: boolean
  revisionSource?: DocumentRevisionSource
}): Promise<ServiceResult<LoopDocument | null>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }

  const { data: current, error: currentError } = await auth.supabase
    .from("documents")
    .select("id, user_id")
    .eq("id", input.id)
    .maybeSingle()
  if (currentError) return { success: false, error: currentError.message }
  if (!current) return { success: true, data: null }
  const roles = await rolesForDocuments(auth, [current])
  if (!roles.success) return roles
  const role = roles.data.get(input.id)
  if (!role) return { success: false, error: "Forbidden" }
  if (role === "viewer") return { success: false, error: "Forbidden" }
  if (
    role !== "owner" &&
    (input.folderId !== undefined || input.starred !== undefined)
  ) {
    return { success: false, error: "Forbidden" }
  }

  if (input.revisionSource) {
    const { data: revisionDocument, error: revisionDocumentError } = await auth.supabase
      .from("documents")
      .select("id, title, content")
      .eq("id", input.id)
      .maybeSingle()
    if (revisionDocumentError) {
      return { success: false, error: revisionDocumentError.message }
    }
    if (!revisionDocument) return { success: true, data: null }

    if (role === "owner") {
      const { error: revisionError } = await auth.supabase
        .from("document_revisions")
        .insert({
          document_id: input.id,
          user_id: auth.user.id,
          title: revisionDocument.title,
          content: revisionDocument.content,
          source: input.revisionSource,
        })
      if (revisionError) return { success: false, error: revisionError.message }
    }
  }

  const values: Record<string, unknown> = {}
  if (input.title !== undefined) values.title = input.title
  if (input.content !== undefined) values.content = input.content
  if (input.folderId !== undefined) values.folder_id = input.folderId
  if (input.starred !== undefined) values.starred = input.starred

  const { data, error } = await auth.supabase
    .from("documents")
    .update(values)
    .eq("id", input.id)
    .select("*")
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: data ? toDocument(data as DocumentRow, role) : null,
  }
}

export async function deleteDocument(id: string): Promise<ServiceResult<null>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const { error } = await auth.supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id)
  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function listDocumentFolders(
  parentId: string | null = null
): Promise<ServiceResult<DocumentFolder[]>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  let query = auth.supabase
    .from("document_folders")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("name", { ascending: true })
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null)
  const { data, error } = await query
  if (error) return { success: false, error: error.message }
  return { success: true, data: ((data ?? []) as FolderRow[]).map(toFolder) }
}

export async function createDocumentFolder(input: {
  name: string
  parentId?: string | null
}): Promise<ServiceResult<DocumentFolder>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const { data, error } = await auth.supabase
    .from("document_folders")
    .insert({
      user_id: auth.user.id,
      parent_id: input.parentId ?? null,
      name: input.name,
    })
    .select("*")
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, data: toFolder(data as FolderRow) }
}

export async function deleteDocumentFolder(id: string): Promise<ServiceResult<null>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const { error } = await auth.supabase
    .from("document_folders")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id)
  if (error) return { success: false, error: error.message }
  return { success: true, data: null }
}

export async function listDocumentRevisions(
  documentId: string
): Promise<ServiceResult<DocumentRevision[]>> {
  const document = await getDocument(documentId)
  if (!document.success) return document
  if (!document.data) return { success: false, error: "Document not found" }
  if (document.data.role !== "owner") {
    return { success: false, error: "Forbidden" }
  }

  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const { data, error } = await auth.supabase
    .from("document_revisions")
    .select("id, document_id, title, content, source, created_by, created_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) return { success: false, error: error.message }
  return {
    success: true,
    data: ((data ?? []) as RevisionRow[]).map((row) => ({
      id: row.id,
      documentId: row.document_id,
      title: row.title,
      content: row.content,
      source: row.source,
      createdBy: row.created_by,
      createdAt: row.created_at,
    })),
  }
}

export async function createDocumentCheckpoint(input: {
  documentId: string
  source: Extract<DocumentRevisionSource, "agent" | "restore" | "template">
}): Promise<ServiceResult<{ id: string }>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const { data, error } = await auth.supabase.rpc("create_document_checkpoint", {
    p_document_id: input.documentId,
    p_source: input.source,
  })
  if (error) return { success: false, error: error.message }
  return { success: true, data: { id: data as string } }
}

