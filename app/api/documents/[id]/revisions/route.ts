import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { serviceErrorStatus } from "@/lib/api/route-schemas"
import {
  createDocumentCheckpoint,
  listDocumentRevisions,
} from "@/lib/db/documents"

const checkpointSchema = z.object({
  source: z.enum(["agent", "restore", "template"]),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  const result = await listDocumentRevisions(id)
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
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = checkpointSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid checkpoint" }, { status: 400 })
  }
  const result = await createDocumentCheckpoint({
    documentId: id,
    source: parsed.data.source,
  })
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data }, { status: 201 })
}