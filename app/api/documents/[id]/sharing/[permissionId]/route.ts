import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { serviceErrorStatus } from "@/lib/api/route-schemas"
import {
  revokeDocumentPermission,
  updateDocumentPermission,
} from "@/lib/db/document-sharing"

const roleSchema = z.object({ role: z.enum(["viewer", "editor"]) })

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; permissionId: string }> }
) {
  const { id, permissionId } = await params
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(permissionId).success) {
    return NextResponse.json({ error: "Permission not found" }, { status: 404 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = roleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }
  const result = await updateDocumentPermission({
    documentId: id,
    permissionId,
    role: parsed.data.role,
  })
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; permissionId: string }> }
) {
  const { id, permissionId } = await params
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(permissionId).success) {
    return NextResponse.json({ error: "Permission not found" }, { status: 404 })
  }
  const result = await revokeDocumentPermission({ documentId: id, permissionId })
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data })
}