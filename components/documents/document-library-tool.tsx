"use client"

import {
  CheckIcon,
  FilePlus2Icon,
  FileSearchIcon,
  FileTextIcon,
  FolderIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react"
import Link from "next/link"
import { Streamdown } from "streamdown"

import { AgentCard, AgentDisclosure } from "@/components/agent"

export interface DocumentLibraryToolPartData {
  type?: string
  state?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  errorText?: string
  approval?: { id?: string; approved?: boolean }
}

const DOCUMENT_LIBRARY_TOOL_TYPES = new Set([
  "tool-listUserDocuments",
  "tool-readUserDocument",
  "tool-listUserFolders",
  "tool-createNewDocument",
  "tool-createNewFolder",
  "tool-moveDocumentToFolder",
  "tool-deleteUserFolder",
  "tool-deleteUserDocument",
])

const DOCUMENT_LIBRARY_MUTATION_TYPES = new Set([
  "tool-createNewDocument",
  "tool-createNewFolder",
  "tool-moveDocumentToFolder",
  "tool-deleteUserFolder",
  "tool-deleteUserDocument",
])

export function isDocumentLibraryToolType(type?: string): boolean {
  return Boolean(type && DOCUMENT_LIBRARY_TOOL_TYPES.has(type))
}

export function DocumentLibraryTool({
  part,
  onApprove,
  onReject,
}: {
  part: DocumentLibraryToolPartData
  onApprove?: (approvalId: string) => void
  onReject?: (approvalId: string) => void
}) {
  if (!part.type || !isDocumentLibraryToolType(part.type)) return null
  const toolName = part.type.replace(/^tool-/, "")

  if (DOCUMENT_LIBRARY_MUTATION_TYPES.has(part.type)) {
    return (
      <DocumentLibraryMutation
        toolName={toolName}
        part={part}
        onApprove={onApprove}
        onReject={onReject}
      />
    )
  }

  if (toolName === "listUserDocuments") {
    if (part.state !== "output-available") {
      return <DocumentActivity label="Searching your documents..." />
    }
    const documents = Array.isArray(part.output?.documents)
      ? (part.output.documents as Array<{
          id: string
          title: string
          updatedAt?: string
        }>)
      : []
    const query =
      typeof part.output?.query === "string" ? part.output.query : null
    return (
      <AgentDisclosure
        title={query ? `Documents for "${query}"` : "Document library"}
        icon={<FileSearchIcon className="size-3.5" />}
        meta={documents.length}
        defaultOpen
      >
        {documents.length > 0 ? (
          <div className="divide-y divide-line">
            {documents.slice(0, 12).map((document) => (
              <Link
                key={document.id}
                href={`/documents/${document.id}`}
                className="flex min-h-10 items-center gap-2 px-3 py-2 text-[12px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
              >
                <FileTextIcon className="size-3.5 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate">{document.title}</span>
                <span className="shrink-0 text-[10px] text-ink-3">Open</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-3 py-3 text-[12px] text-ink-3">
            No documents found.
          </p>
        )}
      </AgentDisclosure>
    )
  }

  if (toolName === "readUserDocument") {
    if (part.state !== "output-available") {
      return <DocumentActivity label="Reading the document..." />
    }
    const title = String(part.output?.title ?? "Document")
    const content = String(part.output?.content ?? "")
    const id = typeof part.output?.id === "string" ? part.output.id : null
    return (
      <AgentDisclosure
        title={title}
        icon={<FileTextIcon className="size-3.5" />}
        meta={`${String(part.output?.wordCount ?? 0)} words`}
        defaultOpen
      >
        <div className="max-h-80 overflow-y-auto px-3 py-3">
          {content ? (
            <Streamdown className="loop-markdown text-[12px] leading-relaxed" animated={false}>
              {content}
            </Streamdown>
          ) : (
            <p className="text-[12px] text-ink-3">This document is empty.</p>
          )}
        </div>
        {id && (
          <div className="border-t border-line px-3 py-2">
            <Link
              href={`/documents/${id}`}
              className="inline-flex text-[11px] font-medium text-accent-ink hover:underline"
            >
              Open in documents
            </Link>
          </div>
        )}
      </AgentDisclosure>
    )
  }

  if (part.state !== "output-available") {
    return <DocumentActivity label="Loading folders..." />
  }
  const folders = Array.isArray(part.output?.folders)
    ? (part.output.folders as Array<{ id: string; name: string }>)
    : []
  return (
    <AgentDisclosure
      title="Folders"
      icon={<FolderIcon className="size-3.5" />}
      meta={folders.length}
      defaultOpen
    >
      {folders.length > 0 ? (
        <div className="divide-y divide-line">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="flex min-h-9 items-center gap-2 px-3 py-2 text-[12px] text-ink-2"
            >
              <FolderIcon className="size-3.5 text-ink-3" />
              <span className="truncate">{folder.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-3 py-3 text-[12px] text-ink-3">No folders yet.</p>
      )}
    </AgentDisclosure>
  )
}

function DocumentLibraryMutation({
  toolName,
  part,
  onApprove,
  onReject,
}: {
  toolName: string
  part: DocumentLibraryToolPartData
  onApprove?: (approvalId: string) => void
  onReject?: (approvalId: string) => void
}) {
  const approvalId = part.approval?.id
  const succeeded = part.state === "output-available" && part.output?.ok === true
  const failed =
    part.state === "output-error" ||
    (part.state === "output-available" && part.output?.ok === false)
  const rejected =
    part.state === "output-denied" ||
    (part.state === "approval-responded" && part.approval?.approved === false)
  const destructive =
    toolName === "deleteUserDocument" || toolName === "deleteUserFolder"
  const documentId =
    typeof part.output?.documentId === "string"
      ? part.output.documentId
      : null
  const content =
    toolName === "createNewDocument" && typeof part.input?.content === "string"
      ? part.input.content
      : ""
  const outputError =
    failed && typeof part.output?.error === "string"
      ? part.output.error
      : undefined
  const errorMessage = part.errorText ?? outputError

  return (
    <AgentCard
      title={mutationTitle(toolName, part.input)}
      icon={
        succeeded ? (
          <CheckIcon className="size-3.5 text-green" />
        ) : destructive ? (
          <Trash2Icon className="size-3.5 text-red" />
        ) : (
          <WandSparklesIcon className="size-3.5" />
        )
      }
      tone={destructive ? "danger" : succeeded ? "success" : "default"}
      meta={
        succeeded
          ? "Applied"
          : failed
            ? "Not applied"
            : rejected
              ? "Skipped"
              : part.state === "approval-requested"
                ? "Approval"
                : "Working"
      }
      footer={
        part.state === "approval-requested" && approvalId ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onReject?.(approvalId)}
              className="h-7 rounded-control px-2.5 text-[12px] text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onApprove?.(approvalId)}
              className="h-7 rounded-control bg-ink px-3 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90"
            >
              Apply change
            </button>
          </div>
        ) : documentId && succeeded ? (
          <Link
            href={`/documents/${documentId}`}
            className="text-[11px] font-medium text-accent-ink hover:underline"
          >
            Open document
          </Link>
        ) : undefined
      }
    >
      <p className="text-[12px] leading-relaxed text-ink-2">
        {mutationDescription(toolName, part.input, part.output, part.state)}
      </p>
      {content && !succeeded && !failed && (
        <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-control bg-inset px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink-2 shadow-hairline">
          {content}
        </pre>
      )}
      {part.state === "approval-responded" && part.approval?.approved && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-3">
          <span className="size-3 rounded-full border-[1.5px] border-line-strong border-t-ink-2 [animation:spin_700ms_linear_infinite]" />
          Applying approved change...
        </div>
      )}
      {errorMessage && (
        <p className="mt-2 text-[11px] text-destructive">
          {errorMessage}
        </p>
      )}
    </AgentCard>
  )
}

function DocumentActivity({ label }: { label: string }) {
  return (
    <div className="my-1 flex items-center gap-2 rounded-control px-1.5 py-1 text-[11.5px] text-ink-3">
      <span className="grid size-4 place-items-center loop-halo">
        <FilePlus2Icon className="size-3.5" />
      </span>
      <span className="loop-shimmer">{label}</span>
    </div>
  )
}

function mutationTitle(
  toolName: string,
  input?: Record<string, unknown>
): string {
  if (toolName === "createNewDocument") {
    return `Create "${String(input?.title ?? "Untitled")}"`
  }
  if (toolName === "createNewFolder") {
    return `Create folder "${String(input?.name ?? "Untitled")}"`
  }
  if (toolName === "moveDocumentToFolder") {
    const folder = input?.folderName
      ? `"${String(input.folderName)}"`
      : "the library root"
    return `Move "${String(input?.title ?? "document")}" to ${folder}`
  }
  if (toolName === "deleteUserFolder") {
    return `Delete folder "${String(input?.name ?? "folder")}"`
  }
  return `Delete "${String(input?.title ?? "document")}"`
}

function mutationDescription(
  toolName: string,
  input: Record<string, unknown> | undefined,
  output: Record<string, unknown> | undefined,
  state: string | undefined
): string {
  if (state === "output-available" && output?.ok) {
    if (toolName === "deleteUserDocument") return "The document was deleted."
    if (toolName === "deleteUserFolder") {
      return "The folder was deleted and its documents returned to the library root."
    }
    if (toolName === "createNewDocument") {
      return "The new document is ready in your library."
    }
    if (toolName === "createNewFolder") {
      return "The new folder is ready in your library."
    }
    return "The document was moved."
  }
  if (toolName === "deleteUserDocument") {
    return "This permanently removes the document and its revision history."
  }
  if (toolName === "deleteUserFolder") {
    return "Documents inside it will move back to the library root."
  }
  if (toolName === "moveDocumentToFolder") {
    return `Move the document to ${String(input?.folderName ?? "the library root")}.`
  }
  return "Loop is ready to apply this change."
}