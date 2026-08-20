import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { serviceErrorStatus } from "@/lib/api/route-schemas"
import {
  createDocumentFolder,
  listDocumentFolders,
} from "@/lib/db/documents"

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.uuid().nullable().optional(),
})

export async function GET(request: NextRequest) {
  const parentId = request.nextUrl.searchParams.get("parent")
  if (parentId && !z.uuid().safeParse(parentId).success) {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 })
  }
  const result = await listDocumentFolders(parentId)
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
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 })
  }
  const result = await createDocumentFolder(parsed.data)
  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: serviceErrorStatus(result.error) }
    )
  }
  return NextResponse.json({ data: result.data }, { status: 201 })
}
