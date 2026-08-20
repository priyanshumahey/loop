import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { serviceErrorStatus } from "@/lib/api/route-schemas"
import {
  getDocumentSharing,
  grantDocumentPermission,
  setDocumentPublicAccess,
} from "@/lib/db/document-sharing"

const inviteSchema = z.object({
  email: z.email().trim().max(320),
  role: z.enum(["viewer", "editor"]),
})
const publicAccessSchema = z.object({ access: z.enum(["none", "view"]) })

function invalidId(id: string) {
  return !z.uuid().safeParse(id).success
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (invalidId(id)) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  const result = await getDocumentSharing(id)
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (invalidId(id)) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = inviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid collaborator" }, { status: 400 })
  }
  const result = await grantDocumentPermission({ documentId: id, ...parsed.data })
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (invalidId(id)) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = publicAccessSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid link access" }, { status: 400 })
  }
  const result = await setDocumentPublicAccess({
    documentId: id,
    access: parsed.data.access,
  })
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data })
}
