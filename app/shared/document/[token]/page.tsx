import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PublicDocumentViewer } from "@/components/documents/public-document-viewer"
import { LoopLogo } from "@/components/loop-logo"
import { getPublicDocument } from "@/lib/db/document-sharing"

export const metadata: Metadata = {
  title: "Shared document · Loop",
  robots: { index: false, follow: false },
}

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!/^[a-f0-9]{32}$/.test(token)) notFound()

  const result = await getPublicDocument(token)
  if (!result.success) throw new Error("Unable to load this document")
  if (!result.data) notFound()

  return (
    <main className="min-h-svh bg-inset px-2 py-4 sm:px-5 sm:py-7">
      <header className="mx-auto mb-4 flex w-[min(8.5in,100%)] items-center justify-between gap-3">
        <LoopLogo />
        <div className="min-w-0 text-right">
          <h1 className="truncate font-heading text-[15px] font-semibold text-ink">
            {result.data.title}
          </h1>
          <p className="text-[10px] text-ink-3">View-only shared document</p>
        </div>
      </header>
      <PublicDocumentViewer document={result.data} />
    </main>
  )
}