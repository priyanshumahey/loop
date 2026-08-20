import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { serviceErrorStatus } from "@/lib/api/route-schemas"
import { respondToDocumentAccessRequest } from "@/lib/db/document-sharing"

const responseSchema = z.object({
  status: z.enum(["approved", "rejected"]),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id, requestId } = await params
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(requestId).success) {
    return NextResponse.json({ error: "Access request not found" }, { status: 404 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = responseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request response" }, { status: 400 })
  }
  const result = await respondToDocumentAccessRequest({
    documentId: id,
    requestId,
    status: parsed.data.status,
  })
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data })
}