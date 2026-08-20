"use client"

import {
  HistoryIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
} from "lucide-react"
import type { Value } from "platejs"
import { useEditorRef } from "platejs/react"
import { useState } from "react"

import { DocumentRevisionDiff } from "@/components/documents/document-revision-diff"
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
  const [selectedRevision, setSelectedRevision] =
    useState<DocumentRevision | null>(null)
  const editor = useEditorRef()

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const nextRevisions = await fetchDocumentRevisions(documentId)
      setRevisions(nextRevisions)
      setSelectedRevision((current) =>
        current && nextRevisions.some((revision) => revision.id === current.id)
          ? current
          : (nextRevisions[0] ?? null)
      )
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
        <DialogContent className="h-[min(760px,calc(100svh-2rem))] max-w-[min(1000px,calc(100vw-2rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-window p-0 sm:max-w-[min(1000px,calc(100vw-2rem))]">
          <DialogHeader className="border-b border-line px-5 py-4">
            <DialogTitle className="text-[17px]">Version history</DialogTitle>
            <DialogDescription>
              Compare a checkpoint with the live document or restore it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 grid-rows-[minmax(180px,38%)_minmax(0,1fr)] md:grid-cols-[320px_minmax(0,1fr)] md:grid-rows-1">
            <div className="min-h-0 overflow-y-auto border-b border-line p-3 md:border-r md:border-b-0">
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
                    <div
                      key={revision.id}
                      className={
                        selectedRevision?.id === revision.id
                          ? "flex items-center gap-2 rounded-card bg-field p-1.5"
                          : "flex items-center gap-2 rounded-card p-1.5 transition-colors hover:bg-hover"
                      }
                    >
                      <button
                        type="button"
                        aria-pressed={selectedRevision?.id === revision.id}
                        onClick={() => setSelectedRevision(revision)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-control p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-control bg-surface text-ink-3 shadow-hairline">
                          <HistoryIcon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-ink">
                            {revision.title}
                          </span>
                          <span className="block text-[10px] leading-relaxed text-ink-3">
                            {sourceLabel[revision.source]} · {new Date(revision.createdAt).toLocaleString()} · {revisionWordCount(revision)} words
                          </span>
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={restoring !== null}
                        onClick={() => void restore(revision)}
                        aria-label={`Restore ${revision.title}`}
                        title="Restore checkpoint"
                      >
                        {restoring === revision.id ? (
                          <LoaderCircleIcon className="animate-spin" />
                        ) : (
                          <RotateCcwIcon />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="min-h-0 overflow-y-auto bg-inset">
              {selectedRevision ? (
                <>
                  <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-ink">
                        Changes since {selectedRevision.title}
                      </p>
                      <p className="text-[10px] text-ink-3">
                        {new Date(selectedRevision.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-ink-3">
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-[2px] bg-green/30" /> Added
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-[2px] bg-destructive/30" /> Removed
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-[2px] bg-accent/30" /> Changed
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <DocumentRevisionDiff
                      current={editor.children as Value}
                      previous={selectedRevision.content}
                    />
                  </div>
                </>
              ) : (
                <div className="grid h-full min-h-40 place-items-center px-6 text-center text-[12px] text-ink-3">
                  Select a checkpoint to compare it with the live document.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}