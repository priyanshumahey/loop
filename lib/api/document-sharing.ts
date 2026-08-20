import type { ApiResponse } from "@/lib/api/types"
import type {
  DocumentPermissionRole,
  DocumentPublicAccess,
  DocumentSharingData,
} from "@/lib/document-sharing"

async function sharingData(
  response: Response,
  fallback: string
): Promise<DocumentSharingData> {
  const result: ApiResponse<DocumentSharingData> = await response.json()
  if (!response.ok || !result.data) throw new Error(result.error || fallback)
  return result.data
}

export async function fetchDocumentSharing(
  documentId: string
): Promise<DocumentSharingData> {
  return sharingData(
    await fetch(`/api/documents/${documentId}/sharing`),
    "Failed to load sharing"
  )
}

export async function inviteDocumentCollaborator(input: {
  documentId: string
  email: string
  role: DocumentPermissionRole
}): Promise<DocumentSharingData> {
  return sharingData(
    await fetch(`/api/documents/${input.documentId}/sharing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email, role: input.role }),
    }),
    "Failed to share document"
  )
}

export async function changeDocumentCollaboratorRole(input: {
  documentId: string
  permissionId: string
  role: DocumentPermissionRole
}): Promise<DocumentSharingData> {
  return sharingData(
    await fetch(
      `/api/documents/${input.documentId}/sharing/${input.permissionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: input.role }),
      }
    ),
    "Failed to update access"
  )
}

export async function removeDocumentCollaborator(input: {
  documentId: string
  permissionId: string
}): Promise<DocumentSharingData> {
  return sharingData(
    await fetch(
      `/api/documents/${input.documentId}/sharing/${input.permissionId}`,
      { method: "DELETE" }
    ),
    "Failed to remove access"
  )
}

export async function setDocumentLinkAccess(input: {
  documentId: string
  access: DocumentPublicAccess
}): Promise<DocumentSharingData> {
  return sharingData(
    await fetch(`/api/documents/${input.documentId}/sharing`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access: input.access }),
    }),
    "Failed to update link access"
  )
}

export async function respondToAccessRequest(input: {
  documentId: string
  requestId: string
  status: "approved" | "rejected"
}): Promise<DocumentSharingData> {
  return sharingData(
    await fetch(
      `/api/documents/${input.documentId}/sharing/requests/${input.requestId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: input.status }),
      }
    ),
    "Failed to respond to access request"
  )
}

export async function requestDocumentAccess(input: {
  documentId: string
  role: DocumentPermissionRole
  message?: string
}): Promise<{ id: string }> {
  const response = await fetch(`/api/documents/${input.documentId}/access-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: input.role, message: input.message }),
  })
  const result: ApiResponse<{ id: string }> = await response.json()
  if (!response.ok || !result.data) {
    throw new Error(result.error || "Failed to request access")
  }
  return result.data
}
