"use client"

import {
  FilePlus2Icon,
  FileTextIcon,
  FolderIcon,
  LibraryIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"

import { AppSidebar } from "@/components/app-sidebar"
import type { DocumentFolder, DocumentSummary } from "@/lib/documents"
import { cn } from "@/lib/utils"

export function DocumentsSidebar({
  documents,
  folders,
  activeDocumentId,
  activeFolderId,
  onNewDocument,
  onSelectFolder,
  onDeleteFolder,
}: {
  documents: DocumentSummary[]
  folders: DocumentFolder[]
  activeDocumentId?: string
  activeFolderId?: string | null
  onNewDocument: () => void
  onSelectFolder?: (folderId: string | null) => void
  onDeleteFolder?: (folder: DocumentFolder) => void
}) {
  return (
    <AppSidebar
      active="documents"
      railAction={
        <button
          type="button"
          onClick={onNewDocument}
          title="New document"
          className="mt-1 grid size-9 place-items-center rounded-control bg-surface text-ink shadow-btn transition-colors hover:bg-hover"
        >
          <FilePlus2Icon className="size-4" />
        </button>
      }
    >
      <button
        type="button"
        onClick={onNewDocument}
        className="mt-1 flex w-full items-center gap-2 rounded-control bg-ink px-3 py-2 text-[13px] font-medium text-canvas shadow-btn transition-opacity hover:opacity-90"
      >
        <FilePlus2Icon className="size-4" />
        New document
      </button>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {onSelectFolder ? (
          <button
            type="button"
            onClick={() => onSelectFolder(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-[13px] transition-colors",
              activeFolderId === null
                ? "bg-surface text-ink shadow-btn"
                : "text-ink-3 hover:bg-hover hover:text-ink"
            )}
          >
            <LibraryIcon className="size-3.5" />
            Library
          </button>
        ) : (
          <Link
            href="/documents"
            className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-[13px] text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <LibraryIcon className="size-3.5" />
            Library
          </Link>
        )}

        {folders.length > 0 && (
          <section className="mt-4">
            <p className="px-2 pb-1 text-[10px] font-medium uppercase text-ink-3">
              Folders
            </p>
            {folders.map((folder) => (
              <div
                key={folder.id}
                className={cn(
                  "group flex w-full items-center rounded-control text-[13px] transition-colors",
                  activeFolderId === folder.id
                    ? "bg-surface text-ink shadow-btn"
                    : "text-ink-3 hover:bg-hover hover:text-ink"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectFolder?.(folder.id)}
                  disabled={!onSelectFolder}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left disabled:cursor-default"
                >
                  <FolderIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </button>
                {onDeleteFolder && (
                  <button
                    type="button"
                    onClick={() => onDeleteFolder(folder)}
                    aria-label={`Delete folder ${folder.name}`}
                    className="mr-1 grid size-6 shrink-0 place-items-center rounded-[6px] text-ink-3 opacity-0 transition-[opacity,color,background-color] hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </section>
        )}

        <section className="mt-4">
          <p className="px-2 pb-1 text-[10px] font-medium uppercase text-ink-3">
            Recent
          </p>
          {documents.slice(0, 12).map((document) => (
            <Link
              key={document.id}
              href={`/documents/${document.id}`}
              className={cn(
                "flex items-center gap-2 rounded-control px-2 py-1.5 text-[13px] transition-colors",
                activeDocumentId === document.id
                  ? "bg-surface text-ink shadow-btn"
                  : "text-ink-3 hover:bg-hover hover:text-ink"
              )}
            >
              <FileTextIcon className="size-3.5 shrink-0" />
              <span className="truncate">{document.title}</span>
            </Link>
          ))}
        </section>
      </div>
    </AppSidebar>
  )
}
