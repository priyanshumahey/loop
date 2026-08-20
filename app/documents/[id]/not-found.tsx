import { FileQuestionIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function DocumentNotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-inset px-6 text-center">
      <span className="grid size-11 place-items-center rounded-card bg-surface text-ink-3 shadow-card">
        <FileQuestionIcon className="size-5" />
      </span>
      <h1 className="mt-4 font-heading text-xl font-semibold text-ink">
        Document not found
      </h1>
      <p className="mt-1 max-w-sm text-sm text-ink-3">
        It may have been deleted, or you may not have access to it.
      </p>
      <Button className="mt-5" render={<Link href="/documents" />}>
        Back to documents
      </Button>
    </main>
  )
}