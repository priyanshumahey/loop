"use client"

import {
  HistoryIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetchDocumentRevisions } from "@/lib/api/documents"
import type { DocumentRevision } from "@/lib/documents"

const sourceLabel: Record<DocumentRevision["source"], string> = {
  agent: "Before agent edit",
  restore: "Before restore",
  template: "Template checkpoint",
  user: "Editing checkpoint",
}

function revisionWordCount(revision: DocumentRevision): number {
  const text = JSON.stringify(revision.content)
    .replace(/"text"\s*:\s*"([^"]*)"/g, "$1 ")
    .replace(/[{}[\]":,]/g, " ")
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function DocumentHistoryDialog({
  documentId,
  onRestore,
}: {
  documentId: string
  onRestore: (revision: DocumentRevision) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [revisions, setRevisions] = useState<DocumentRevision[]>([])
  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setRevisions(await fetchDocumentRevisions(documentId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load history")
    } finally {
      setLoading(false)
    }
  }

  const show = () => {
    setOpen(true)
    void load()
  }

  const restore = async (revision: DocumentRevision) => {
    setRestoring(revision.id)
    setError(null)
    try {
      await onRestore(revision)
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to restore revision")
    } finally {
      setRestoring(null)
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={show} aria-label="Document history" title="Document history">
        <HistoryIcon />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-window p-0">
          <DialogHeader className="border-b border-line px-5 py-4">
            <DialogTitle className="text-[17px]">Version history</DialogTitle>
            <DialogDescription>
              Restore an earlier checkpoint into the live document.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto p-3">
            {error && (
              <div role="alert" className="mb-2 rounded-control border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            )}
            {loading ? (
              <div className="grid h-40 place-items-center text-ink-3">
                <LoaderCircleIcon className="size-4 animate-spin" />
              </div>
            ) : revisions.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center text-center">
                <HistoryIcon className="size-5 text-ink-3" />
                <p className="mt-2 text-[12px] font-medium text-ink">No checkpoints yet</p>
                <p className="mt-1 max-w-56 text-[11px] text-ink-3">
                  Loop creates checkpoints as the document changes.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {revisions.map((revision) => (
                  <div key={revision.id} className="flex items-center gap-3 rounded-card px-3 py-2.5 transition-colors hover:bg-hover">
                    <span className="grid size-8 shrink-0 place-items-center rounded-control bg-field text-ink-3">
                      <HistoryIcon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-ink">
                        {revision.title}
                      </p>
                      <p className="text-[10px] text-ink-3">
                        {sourceLabel[revision.source]} · {new Date(revision.createdAt).toLocaleString()} · {revisionWordCount(revision)} words
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={restoring !== null}
                      onClick={() => void restore(revision)}
                    >
                      {restoring === revision.id ? (
                        <LoaderCircleIcon className="animate-spin" />
                      ) : (
                        <RotateCcwIcon />
                      )}
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}