import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { DocumentWorkspace } from "@/components/documents/document-workspace"
import {
  getDocument,
  listDocumentFolders,
  listDocuments,
} from "@/lib/db/documents"
import { createClient } from "@/lib/supabase/server"

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/")

  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const [template, documents, folders] = await Promise.all([
    getDocument(id),
    listDocuments({ allFolders: true }),
    listDocumentFolders(),
  ])
  if (!template.success) throw new Error(template.error)
  if (!documents.success) throw new Error(documents.error)
  if (!folders.success) throw new Error(folders.error)
  if (!template.data || template.data.kind !== "template") notFound()

  const metadata = user.user_metadata ?? {}
  return (
    <DocumentWorkspace
      initialDocument={template.data}
      documents={documents.data}
      folders={folders.data}
      currentUser={{
        id: user.id,
        email: user.email ?? "",
        name:
          metadata.full_name ??
          metadata.name ??
          user.email?.split("@")[0] ??
          "Collaborator",
      }}
    />
  )
}
