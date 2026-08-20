import type {
  DocumentPermissionRole,
  DocumentPublicAccess,
  DocumentAccessRequest,
  DocumentSharePerson,
  DocumentSharingData,
  PublicDocument,
} from "@/lib/document-sharing"
import { currentUser, type ServiceResult } from "@/lib/db/service"
import { createClient } from "@/lib/supabase/server"
import type { Value } from "platejs"

interface SharingRow {
  permission_id: string | null
  user_id: string
  email: string
  role: "owner" | DocumentPermissionRole
  is_owner: boolean
  created_at: string
}

interface AccessRequestRow {
  request_id: string
  requester_id: string
  requester_email: string
  requested_role: DocumentPermissionRole
  message: string | null
  created_at: string
}

export async function getDocumentSharing(
  documentId: string
): Promise<ServiceResult<DocumentSharingData>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const [permissions, document, requests] = await Promise.all([
    auth.supabase.rpc("list_document_permissions", {
      p_document_id: documentId,
    }),
    auth.supabase
      .from("documents")
      .select("public_access, public_token")
      .eq("id", documentId)
      .single(),
    auth.supabase.rpc("list_document_access_requests", {
      p_document_id: documentId,
    }),
  ])
  if (permissions.error) {
    return { success: false, error: permissions.error.message }
  }
  if (document.error) return { success: false, error: document.error.message }
  if (requests.error) return { success: false, error: requests.error.message }
  const people: DocumentSharePerson[] = (
    (permissions.data ?? []) as SharingRow[]
  ).map(
    (row) => ({
      permissionId: row.permission_id,
      userId: row.user_id,
      email: row.email,
      role: row.role,
      isOwner: row.is_owner,
      createdAt: row.created_at,
    })
  )
  const pendingRequests: DocumentAccessRequest[] = (
    (requests.data ?? []) as AccessRequestRow[]
  ).map((row) => ({
    id: row.request_id,
    requesterId: row.requester_id,
    requesterEmail: row.requester_email,
    requestedRole: row.requested_role,
    message: row.message,
    createdAt: row.created_at,
  }))
  return {
    success: true,
    data: {
      people,
      publicAccess: document.data.public_access as DocumentPublicAccess,
      publicToken: document.data.public_token,
      pendingRequests,
    },
  }
}

export async function grantDocumentPermission(input: {
  documentId: string
  email: string
  role: DocumentPermissionRole
}): Promise<ServiceResult<DocumentSharingData>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const { error } = await auth.supabase.rpc(
    "grant_document_permission_by_email",
    {
      p_document_id: input.documentId,
      p_email: input.email,
      p_role: input.role,
    }
  )
  if (error) return { success: false, error: error.message }
  return getDocumentSharing(input.documentId)
}

export async function updateDocumentPermission(input: {
  documentId: string
  permissionId: string
  role: DocumentPermissionRole
}): Promise<ServiceResult<DocumentSharingData>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const { error } = await auth.supabase.rpc(
    "update_document_permission_role",
    {
      p_permission_id: input.permissionId,
      p_role: input.role,
    }
  )
  if (error) return { success: false, error: error.message }
  return getDocumentSharing(input.documentId)
}

export async function revokeDocumentPermission(input: {
  documentId: string
  permissionId: string
}): Promise<ServiceResult<DocumentSharingData>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const { error } = await auth.supabase.rpc("revoke_document_permission", {
    p_permission_id: input.permissionId,
  })
  if (error) return { success: false, error: error.message }
  return getDocumentSharing(input.documentId)
}

export async function setDocumentPublicAccess(input: {
  documentId: string
  access: DocumentPublicAccess
}): Promise<ServiceResult<DocumentSharingData>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const { error } = await auth.supabase.rpc("set_document_public_access", {
    p_document_id: input.documentId,
    p_access: input.access,
  })
  if (error) return { success: false, error: error.message }
  return getDocumentSharing(input.documentId)
}

export async function respondToDocumentAccessRequest(input: {
  documentId: string
  requestId: string
  status: "approved" | "rejected"
}): Promise<ServiceResult<DocumentSharingData>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const { error } = await auth.supabase.rpc("respond_document_access_request", {
    p_request_id: input.requestId,
    p_status: input.status,
  })
  if (error) return { success: false, error: error.message }
  return getDocumentSharing(input.documentId)
}

export async function requestDocumentAccess(input: {
  documentId: string
  role: DocumentPermissionRole
  message?: string
}): Promise<ServiceResult<{ id: string }>> {
  const auth = await currentUser()
  if (!auth) return { success: false, error: "Unauthorized" }
  const { data, error } = await auth.supabase.rpc("request_document_access", {
    p_document_id: input.documentId,
    p_requested_role: input.role,
    p_message: input.message ?? null,
  })
  if (error) return { success: false, error: error.message }
  return { success: true, data: { id: data as string } }
}

export async function getPublicDocument(
  token: string
): Promise<ServiceResult<PublicDocument | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_public_document", {
    p_token: token,
  })
  if (error) return { success: false, error: error.message }
  const row = (data?.[0] ?? null) as {
    document_id: string
    title: string
    content: Value
    updated_at: string
  } | null
  return {
    success: true,
    data: row
      ? {
          id: row.document_id,
          title: row.title,
          content: row.content,
          updatedAt: row.updated_at,
        }
      : null,
  }
}
