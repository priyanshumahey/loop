import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  plateValueSchema,
  serviceErrorStatus,
} from "@/lib/api/route-schemas"
import { createDocument, listDocuments } from "@/lib/db/documents"

const createSchema = z.object({
  title: z.string().trim().min(1).max(240),
  content: plateValueSchema,
  folderId: z.uuid().nullable().optional(),
  kind: z.enum(["document", "template"]).optional(),
  creationMode: z.enum(["classic", "agent"]).optional(),
})

export async function GET(request: NextRequest) {
  const folderId = request.nextUrl.searchParams.get("folder")
  const allFolders = request.nextUrl.searchParams.get("all") === "1"
  const kind = request.nextUrl.searchParams.get("kind")
  if (folderId && !z.uuid().safeParse(folderId).success) {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 })
  }
  if (kind && kind !== "document" && kind !== "template") {
    return NextResponse.json({ error: "Invalid document kind" }, { status: 400 })
  }
  const result = await listDocuments({
    folderId,
    allFolders,
    kind: kind === "template" ? "template" : "document",
    includePreview: true,
  })
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid document" }, { status: 400 })
  }
  const result = await createDocument(parsed.data)
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data }, { status: 201 })
}
