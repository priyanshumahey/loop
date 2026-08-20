import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  plateValueSchema,
  serviceErrorStatus,
} from "@/lib/api/route-schemas"
import {
  deleteDocument,
  getDocument,
  updateDocument,
} from "@/lib/db/documents"

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    content: plateValueSchema.optional(),
    folderId: z.uuid().nullable().optional(),
    starred: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  const result = await getDocument(id)
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  if (!result.data) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  return NextResponse.json({ data: result.data })
}

export async function PATCH(
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
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid document update" }, { status: 400 })
  }
  const result = await updateDocument({ id, ...parsed.data })
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  if (!result.data) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  return NextResponse.json({ data: result.data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }
  const result = await deleteDocument(id)
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: null })
}
