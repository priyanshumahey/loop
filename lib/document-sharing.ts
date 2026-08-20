import type { Value } from "platejs"

export type DocumentPermissionRole = "viewer" | "editor"
export type DocumentPublicAccess = "none" | "view"

export interface DocumentSharePerson {
  permissionId: string | null
  userId: string
  email: string
  role: "owner" | DocumentPermissionRole
  isOwner: boolean
  createdAt: string
}

export interface DocumentSharingData {
  people: DocumentSharePerson[]
  publicAccess: DocumentPublicAccess
  publicToken: string
  pendingRequests: DocumentAccessRequest[]
}

export interface DocumentAccessRequest {
  id: string
  requesterId: string
  requesterEmail: string
  requestedRole: DocumentPermissionRole
  message: string | null
  createdAt: string
}

export interface PublicDocument {
  id: string
  title: string
  content: Value
  updatedAt: string
}
