import { redirect } from "next/navigation"

import { DocumentsWorkspace } from "@/components/documents/documents-workspace"
import { listDocumentFolders, listDocuments } from "@/lib/db/documents"
import { createClient } from "@/lib/supabase/server"

export default async function DocumentsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/")

  const [documents, folders, templates] = await Promise.all([
    listDocuments({ allFolders: true, includePreview: true }),
    listDocumentFolders(),
    listDocuments({ allFolders: true, kind: "template", includePreview: true }),
  ])

  if (!documents.success) throw new Error(documents.error)
  if (!folders.success) throw new Error(folders.error)
  if (!templates.success) throw new Error(templates.error)

  return (
    <DocumentsWorkspace
      initialDocuments={documents.data}
      initialFolders={folders.data}
      initialTemplates={templates.data}
    />
  )
}
