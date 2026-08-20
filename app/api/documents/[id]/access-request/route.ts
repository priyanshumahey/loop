import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { serviceErrorStatus } from "@/lib/api/route-schemas"
import { requestDocumentAccess } from "@/lib/db/document-sharing"

const requestSchema = z.object({
  role: z.enum(["viewer", "editor"]),
  message: z.string().trim().max(500).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid access request" }, { status: 400 })
  }
  const result = await requestDocumentAccess({
    documentId: id,
    role: parsed.data.role,
    message: parsed.data.message,
  })
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data }, { status: 201 })
}