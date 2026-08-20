import { notFound, redirect } from "next/navigation"
import { z } from "zod"

import { DocumentWorkspace } from "@/components/documents/document-workspace"
import { RequestDocumentAccess } from "@/components/documents/request-document-access"
import {
  getDocument,
  listDocumentFolders,
  listDocuments,
} from "@/lib/db/documents"
import { createClient } from "@/lib/supabase/server"

export default async function DocumentPage({
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

  const [document, documents, folders] = await Promise.all([
    getDocument(id),
    listDocuments({ allFolders: true }),
    listDocumentFolders(),
  ])
  if (!document.success) throw new Error(document.error)
  if (!documents.success) throw new Error(documents.error)
  if (!folders.success) throw new Error(folders.error)
  if (!document.data) {
    return (
      <RequestDocumentAccess
        documentId={id}
        email={user.email ?? "your account"}
      />
    )
  }
  if (document.data.kind !== "document") notFound()

  const metadata = user.user_metadata ?? {}
  const currentUser = {
    id: user.id,
    email: user.email ?? "",
    name:
      metadata.full_name ??
      metadata.name ??
      user.email?.split("@")[0] ??
      "Collaborator",
  }

  return (
    <DocumentWorkspace
      initialDocument={document.data}
      documents={documents.data}
      folders={folders.data}
      currentUser={currentUser}
    />
  )
}
