"use client"

import {
  CopyPlusIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  Grid2X2Icon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useDeferredValue, useState } from "react"

import { DocumentAgent } from "@/components/documents/document-agent"
import { DocumentsSidebar } from "@/components/documents/documents-sidebar"
import { LoopMark } from "@/components/loop-logo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  createDocument,
  createDocumentFolder,
  deleteDocument,
  deleteDocumentFolder,
  fetchDocument,
  fetchDocumentFolders,
  fetchDocuments,
  updateDocument,
} from "@/lib/api/documents"
import {
  STARTER_TEMPLATES,
  type DocumentFolder,
  type DocumentPreviewBlock,
  type DocumentSummary,
  type StarterTemplate,
} from "@/lib/documents"
import { cn } from "@/lib/utils"

type ViewMode = "grid" | "list"

function MiniPreviewBlock({
  block,
}: {
  block: DocumentPreviewBlock
}) {
  if (block.kind === "heading") {
    return (
      <span
        className={cn(
          "block truncate font-heading font-semibold leading-[10px] text-[#383733] dark:text-ink",
          block.level === 1 ? "text-[8px]" : "text-[7px]"
        )}
      >
        {block.text}
      </span>
    )
  }

  if (block.kind === "quote") {
    return (
      <span className="line-clamp-2 border-l border-[#c8c6c0] pl-1.5 text-[6.5px] italic leading-[9px] text-[#74716a] dark:border-line-strong dark:text-ink-3">
        {block.text}
      </span>
    )
  }

  if (block.kind === "list") {
    return (
      <span className="flex gap-1 text-[6.5px] leading-[9px] text-[#67655f] dark:text-ink-2">
        <span className="shrink-0">{block.ordered ? "1." : "•"}</span>
        <span className="line-clamp-2">{block.text}</span>
      </span>
    )
  }

  if (block.kind === "code") {
    return (
      <span className="block truncate rounded-[2px] bg-[#efeee9] px-1 py-0.5 font-mono text-[6px] leading-[8px] text-[#56544f] dark:bg-inset dark:text-ink-2">
        {block.text}
      </span>
    )
  }

  return (
    <span className="line-clamp-2 text-[6.5px] leading-[9px] text-[#67655f] dark:text-ink-2">
      {block.text}
    </span>
  )
}

function DocumentMiniPreview({ document }: { document: DocumentSummary }) {
  return (
    <span
      data-document-preview={document.id}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 block overflow-hidden px-4 py-3.5"
    >
      <span className="block truncate font-heading text-[10px] font-semibold leading-3 text-[#292825] dark:text-ink">
        {document.title}
      </span>
      <span className="mt-3 block space-y-1.5">
        {document.preview.map((block, index) => (
          <MiniPreviewBlock key={`${block.kind}-${index}`} block={block} />
        ))}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-[#fbfbfa] to-transparent dark:from-field" />
    </span>
  )
}

export function DocumentsWorkspace({
  initialDocuments,
  initialFolders,
  initialTemplates,
}: {
  initialDocuments: DocumentSummary[]
  initialFolders: DocumentFolder[]
  initialTemplates: DocumentSummary[]
}) {
  const router = useRouter()
  const [documents, setDocuments] = useState(initialDocuments)
  const [folders, setFolders] = useState(initialFolders)
  const [templates, setTemplates] = useState(initialTemplates)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>("grid")
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderName, setFolderName] = useState("")
  const [folderToDelete, setFolderToDelete] = useState<DocumentFolder | null>(null)
  const [documentToDelete, setDocumentToDelete] = useState<DocumentSummary | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentRefreshing, setAgentRefreshing] = useState(false)

  const visibleDocuments = documents.filter((document) => {
    if (document.folderId !== activeFolderId) return false
    return !deferredQuery || document.title.toLowerCase().includes(deferredQuery)
  })
  const activeFolder = folders.find((folder) => folder.id === activeFolderId)

  const createFromTemplate = async (template: StarterTemplate) => {
    setError(null)
    setBusyId(template.id)
    try {
      const document = await createDocument({
        title: template.id === "blank" ? "Untitled" : template.name,
        content: template.content,
        folderId: activeFolderId,
      })
      router.push(`/documents/${document.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create document")
      setBusyId(null)
    }
  }

  const createBlank = () => void createFromTemplate(STARTER_TEMPLATES[0])

  const createBlankTemplate = async () => {
    setError(null)
    setBusyId("new-template")
    try {
      const template = await createDocument({
        title: "Untitled Template",
        content: STARTER_TEMPLATES[0].content,
        kind: "template",
      })
      router.push(`/templates/${template.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create template")
      setBusyId(null)
    }
  }

  const instantiateTemplate = async (template: DocumentSummary) => {
    setError(null)
    setBusyId(template.id)
    try {
      const fullTemplate = await fetchDocument(template.id)
      const document = await createDocument({
        title: template.title.replace(/ template$/i, "") || "Untitled",
        content: fullTemplate.content,
        folderId: activeFolderId,
      })
      router.push(`/documents/${document.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to use template")
      setBusyId(null)
    }
  }

  const removeTemplate = async (template: DocumentSummary) => {
    setBusyId(template.id)
    setError(null)
    try {
      await deleteDocument(template.id)
      setTemplates((current) => current.filter((item) => item.id !== template.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete template")
    } finally {
      setBusyId(null)
    }
  }

  const addFolder = async () => {
    const name = folderName.trim()
    if (!name) return
    setError(null)
    try {
      const folder = await createDocumentFolder({ name })
      setFolders((current) => [...current, folder].sort((a, b) => a.name.localeCompare(b.name)))
      setFolderName("")
      setFolderDialogOpen(false)
      setActiveFolderId(folder.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create folder")
    }
  }

  const toggleStar = async (document: DocumentSummary) => {
    setBusyId(document.id)
    try {
      const updated = await updateDocument(document.id, {
        starred: !document.starred,
      })
      setDocuments((current) =>
        current.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                starred: updated.starred,
                updatedAt: updated.updatedAt,
              }
            : item
        )
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update document")
    } finally {
      setBusyId(null)
    }
  }

  const removeDocument = async () => {
    const document = documentToDelete
    if (!document) return
    setBusyId(document.id)
    setError(null)
    try {
      await deleteDocument(document.id)
      setDocuments((current) => current.filter((item) => item.id !== document.id))
      setDocumentToDelete(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete document")
    } finally {
      setBusyId(null)
    }
  }

  const removeFolder = async () => {
    if (!folderToDelete) return
    setBusyId(folderToDelete.id)
    setError(null)
    try {
      await deleteDocumentFolder(folderToDelete.id)
      setFolders((current) =>
        current.filter((folder) => folder.id !== folderToDelete.id)
      )
      setDocuments((current) =>
        current.map((document) =>
          document.folderId === folderToDelete.id
            ? { ...document, folderId: null }
            : document
        )
      )
      if (activeFolderId === folderToDelete.id) setActiveFolderId(null)
      setFolderToDelete(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete folder")
    } finally {
      setBusyId(null)
    }
  }

  const refreshAfterAgentMutation = async () => {
    setAgentRefreshing(true)
    setError(null)
    try {
      const [nextDocuments, nextFolders] = await Promise.all([
        fetchDocuments({ allFolders: true }),
        fetchDocumentFolders(),
      ])
      setDocuments(nextDocuments)
      setFolders(nextFolders)
      if (
        activeFolderId &&
        !nextFolders.some((folder) => folder.id === activeFolderId)
      ) {
        setActiveFolderId(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to refresh library")
    } finally {
      setAgentRefreshing(false)
    }
  }

  return (
    <div className="flex h-svh w-full overflow-hidden bg-inset">
      <div className="hidden md:block">
        <DocumentsSidebar
          documents={documents}
          folders={folders}
          activeFolderId={activeFolderId}
          onNewDocument={createBlank}
          onSelectFolder={setActiveFolderId}
          onDeleteFolder={setFolderToDelete}
        />
      </div>

      <main className="min-w-0 flex-1 p-2 md:pl-0">
        <div className="relative flex h-full overflow-hidden rounded-window bg-surface shadow-card">
          <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-heading text-[17px] font-semibold text-ink">
                {activeFolder?.name ?? "Documents"}
              </h1>
              <p className="text-[11px] text-ink-3">
                {visibleDocuments.length} {visibleDocuments.length === 1 ? "document" : "documents"}
              </p>
            </div>
            <label className="relative hidden w-56 sm:block">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search documents"
                aria-label="Search documents"
                className="h-8 rounded-control border-line bg-field pl-8 text-[13px]"
              />
            </label>
            <div className="flex h-8 items-center rounded-control bg-field p-0.5 shadow-hairline">
              <button
                type="button"
                onClick={() => setView("grid")}
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                className={cn(
                  "grid size-7 place-items-center rounded-[6px] text-ink-3",
                  view === "grid" && "bg-surface text-ink shadow-btn"
                )}
              >
                <Grid2X2Icon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="List view"
                aria-pressed={view === "list"}
                className={cn(
                  "grid size-7 place-items-center rounded-[6px] text-ink-3",
                  view === "list" && "bg-surface text-ink shadow-btn"
                )}
              >
                <ListIcon className="size-3.5" />
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)}>
              <FolderPlusIcon />
              <span className="hidden sm:inline">Folder</span>
            </Button>
            <Button size="sm" onClick={createBlank}>
              <FileTextIcon />
              New
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(to_bottom,var(--surface),var(--inset))] px-4 py-5 sm:px-6">
            <section className="mx-auto max-w-6xl">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-[13px] font-medium text-ink">Start writing</h2>
                  <p className="text-[12px] text-ink-3">A useful structure, ready when you are.</p>
                </div>
                <span className="hidden items-center gap-1 text-[11px] text-ink-3 sm:flex">
                  <LoopMark className="h-3.5 w-3" />
                  Loop assistant works inside every document
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {STARTER_TEMPLATES.map((template, index) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void createFromTemplate(template)}
                    className="group flex min-h-24 flex-col justify-between rounded-card bg-surface p-3 text-left shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-raised disabled:opacity-60"
                  >
                    <span
                      className={cn(
                        "grid size-7 place-items-center rounded-control",
                        index === 0 && "bg-field text-ink-2",
                        index === 1 && "bg-accent-tint text-accent-ink",
                        index === 2 && "bg-green-tint text-green",
                        index === 3 && "bg-orange-tint text-orange"
                      )}
                    >
                      {index === 3 ? <SparklesIcon className="size-3.5" /> : <FileTextIcon className="size-3.5" />}
                    </span>
                    <span className="mt-3">
                      <span className="block text-[13px] font-medium text-ink">{template.name}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">{template.description}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[13px] font-medium text-ink">
                    Your templates
                  </h3>
                  <p className="text-[11px] text-ink-3">
                    Reusable documents with your own structure and formatting.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void createBlankTemplate()}
                  disabled={busyId !== null}
                >
                  <PlusIcon /> New template
                </Button>
              </div>

              {templates.length === 0 ? (
                <button
                  type="button"
                  onClick={() => void createBlankTemplate()}
                  className="mt-3 flex min-h-20 w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-strong text-[12px] text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                >
                  <PlusIcon className="size-3.5" /> Create your first template
                </button>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {templates.map((template) => (
                    <article
                      key={template.id}
                      className="group overflow-hidden rounded-card bg-surface shadow-card"
                    >
                      <button
                        type="button"
                        onClick={() => void instantiateTemplate(template)}
                        disabled={busyId !== null}
                        className="block aspect-[5/3] w-full bg-[#fbfbfa] p-3 text-left transition-colors hover:bg-hover disabled:opacity-60 dark:bg-field"
                      >
                        <span className="grid size-7 place-items-center rounded-control bg-accent-tint text-accent-ink">
                          <CopyPlusIcon className="size-3.5" />
                        </span>
                        <span className="mt-3 block truncate text-[12px] font-medium text-ink">
                          {template.title}
                        </span>
                        <span className="mt-1 block text-[10px] text-ink-3">
                          Use template
                        </span>
                      </button>
                      <div className="flex h-9 items-center border-t border-line px-2">
                        <span className="min-w-0 flex-1 truncate text-[10px] text-ink-3">
                          Updated {new Date(template.updatedAt).toLocaleDateString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => router.push(`/templates/${template.id}`)}
                          aria-label={`Edit template ${template.title}`}
                          className="grid size-6 place-items-center rounded-[6px] text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                        >
                          <PencilIcon className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeTemplate(template)}
                          disabled={busyId === template.id}
                          aria-label={`Delete template ${template.title}`}
                          className="grid size-6 place-items-center rounded-[6px] text-ink-3 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="mx-auto mt-8 max-w-6xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[13px] font-medium text-ink">
                  {activeFolder ? activeFolder.name : "Your documents"}
                </h2>
                {activeFolder && (
                  <button
                    type="button"
                    onClick={() => setActiveFolderId(null)}
                    className="text-[12px] text-accent-ink hover:underline"
                  >
                    Back to library
                  </button>
                )}
              </div>

              {error && (
                <div role="alert" className="mb-3 rounded-control border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                  {error}
                </div>
              )}

              {visibleDocuments.length === 0 ? (
                <div className="flex min-h-52 flex-col items-center justify-center border-y border-dashed border-line text-center">
                  <span className="grid size-9 place-items-center rounded-card bg-field text-ink-3">
                    {activeFolder ? <FolderIcon className="size-4" /> : <FileTextIcon className="size-4" />}
                  </span>
                  <p className="mt-3 text-[13px] font-medium text-ink">Nothing here yet</p>
                  <p className="mt-1 text-[12px] text-ink-3">Start from a template or open a blank page.</p>
                  <Button className="mt-3" size="sm" onClick={createBlank}>Create document</Button>
                </div>
              ) : view === "grid" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {visibleDocuments.map((document) => (
                    <article key={document.id} className="group overflow-hidden rounded-card bg-surface shadow-card">
                      <button
                        type="button"
                        onClick={() => router.push(`/documents/${document.id}`)}
                        aria-label={`Open ${document.title}`}
                        className="relative block aspect-[4/3] w-full overflow-hidden border-b border-line bg-[#fbfbfa] text-left dark:bg-field"
                      >
                        <DocumentMiniPreview document={document} />
                      </button>
                      <div className="flex h-11 items-center gap-2 px-3">
                        <button
                          type="button"
                          onClick={() => router.push(`/documents/${document.id}`)}
                          className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium text-ink"
                        >
                          {document.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleStar(document)}
                          disabled={busyId === document.id}
                          aria-label={document.starred ? "Unstar document" : "Star document"}
                          className="grid size-7 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink"
                        >
                          <StarIcon className={cn("size-3.5", document.starred && "fill-current text-orange")} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDocumentToDelete(document)}
                          disabled={busyId === document.id}
                          aria-label="Delete document"
                          className="grid size-7 place-items-center rounded-control text-ink-3 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2Icon className="size-3.5" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-card bg-surface shadow-card">
                  {visibleDocuments.map((document) => (
                    <div key={document.id} className="group flex h-12 items-center gap-3 border-b border-line px-3 last:border-b-0">
                      <span className="grid size-7 place-items-center rounded-control bg-field text-ink-3"><FileTextIcon className="size-3.5" /></span>
                      <button type="button" onClick={() => router.push(`/documents/${document.id}`)} className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-ink">{document.title}</button>
                      <span className="hidden text-[11px] text-ink-3 sm:block">{new Date(document.updatedAt).toLocaleDateString()}</span>
                      <button type="button" onClick={() => void toggleStar(document)} aria-label="Toggle star" className="grid size-7 place-items-center rounded-control text-ink-3 hover:bg-hover"><StarIcon className={cn("size-3.5", document.starred && "fill-current text-orange")} /></button>
                      <button type="button" onClick={() => setDocumentToDelete(document)} aria-label="Delete document" className="grid size-7 place-items-center rounded-control text-ink-3 hover:bg-destructive/10 hover:text-destructive"><Trash2Icon className="size-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          </div>

          {!agentOpen && (
            <button
              type="button"
              onClick={() => setAgentOpen(true)}
              aria-label="Open Loop assistant"
              title="Open Loop assistant"
              className="absolute bottom-4 right-4 z-30 grid size-10 place-items-center rounded-full bg-ink text-canvas shadow-raised transition-transform hover:scale-[1.04]"
            >
              <LoopMark className="h-5 w-[17px]" />
            </button>
          )}
        </div>
      </main>

      {agentOpen && (
        <aside className="fixed inset-0 z-40 h-svh w-full p-2 sm:relative sm:inset-auto sm:z-auto sm:w-[min(390px,50vw)] sm:shrink-0 sm:pl-0 lg:w-[390px]">
          <div className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-window bg-surface shadow-card">
            <DocumentAgent
              scope="calendar"
              onMutated={() => void refreshAfterAgentMutation()}
              onClose={() => setAgentOpen(false)}
            />
            {agentRefreshing && (
              <div className="pointer-events-none absolute inset-x-3 top-14 z-10 rounded-control bg-inset px-3 py-2 text-center text-[11px] text-ink-3 shadow-card">
                Refreshing your library…
              </div>
            )}
          </div>
        </aside>
      )}

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-sm rounded-window">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Group documents that belong together.</DialogDescription>
          </DialogHeader>
          <Input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addFolder()
            }}
            placeholder="Folder name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFolderDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void addFolder()} disabled={!folderName.trim()}>Create folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={documentToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setDocumentToDelete(null)
        }}
      >
        <DialogContent className="max-w-sm rounded-window">
          <DialogHeader>
            <DialogTitle>Delete {documentToDelete?.title}?</DialogTitle>
            <DialogDescription>
              This document will be permanently deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDocumentToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void removeDocument()}
              disabled={busyId === documentToDelete?.id}
            >
              Delete document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={folderToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setFolderToDelete(null)
        }}
      >
        <DialogContent className="max-w-sm rounded-window">
          <DialogHeader>
            <DialogTitle>Delete {folderToDelete?.name}?</DialogTitle>
            <DialogDescription>
              The folder will be removed. Its documents will return to the library root.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFolderToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void removeFolder()}
              disabled={busyId === folderToDelete?.id}
            >
              Delete folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
