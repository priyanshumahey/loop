"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, type CSSProperties } from "react"

import {
  DocumentAgent,
  type DocumentAgentMutation,
  type PendingDocumentAgentRequest,
} from "@/components/documents/document-agent"
import {
  DocumentEditor,
  type DocumentEditorHandle,
} from "@/components/documents/document-editor"
import { DocumentsSidebar } from "@/components/documents/documents-sidebar"
import { LoopMark } from "@/components/loop-logo"
import { usePersistentState } from "@/hooks/use-persistent-state"
import { useSidebarResize } from "@/hooks/use-sidebar-resize"
import {
  createDocument,
  fetchDocument,
} from "@/lib/api/documents"
import {
  EMPTY_DOCUMENT_VALUE,
  type DocumentFolder,
  type DocumentSummary,
  type LoopDocument,
} from "@/lib/documents"
import type { SelectedTextContext } from "@/lib/document-agent/editor-tools"
import { cn } from "@/lib/utils"

const DEFAULT_AGENT_WIDTH = "390px"
const MIN_AGENT_WIDTH = "20rem"
const MAX_AGENT_WIDTH = "34rem"

export function DocumentWorkspace({
  initialDocument,
  documents,
  folders,
  currentUser,
}: {
  initialDocument: LoopDocument
  documents: DocumentSummary[]
  folders: DocumentFolder[]
  currentUser: { id: string; email: string; name: string }
}) {
  const router = useRouter()
  const [document, setDocument] = useState(initialDocument)
  const [agentOpen, setAgentOpen] = useState(true)
  const [agentRefreshing, setAgentRefreshing] = useState(false)
  const [agentWidth, setAgentWidth] = usePersistentState(
    "loop:document-agent:width",
    DEFAULT_AGENT_WIDTH
  )
  const [isResizingAgent, setIsResizingAgent] = useState(false)
  const [pendingAgentRequest, setPendingAgentRequest] =
    useState<PendingDocumentAgentRequest | null>(null)
  const editorRef = useRef<DocumentEditorHandle>(null)

  const { dragRef, handleMouseDown } = useSidebarResize({
    direction: "left",
    currentWidth: agentWidth,
    onResize: setAgentWidth,
    minResizeWidth: MIN_AGENT_WIDTH,
    maxResizeWidth: MAX_AGENT_WIDTH,
    enableAutoCollapse: false,
    enableToggle: false,
    isNested: true,
    setIsDraggingRail: setIsResizingAgent,
  })

  const createBlank = async () => {
    const created = await createDocument({
      title: "Untitled",
      content: EMPTY_DOCUMENT_VALUE,
    })
    router.push(`/documents/${created.id}`)
  }

  const handleMutation = async (mutation: DocumentAgentMutation) => {
    const changedDocumentId = mutation.output.documentId
    if (mutation.tool === "deleteUserDocument") {
      if (changedDocumentId === document.id) router.push("/documents")
      return
    }
    if (
      changedDocumentId !== document.id ||
      mutation.tool === "createNewDocument"
    ) {
      return
    }

    setAgentRefreshing(true)
    try {
      const refreshed = await fetchDocument(document.id)
      setDocument(refreshed)
    } finally {
      setAgentRefreshing(false)
    }
  }

  const sendSelectionPrompt = (
    prompt: string,
    context: SelectedTextContext
  ) => {
    setAgentOpen(true)
    setPendingAgentRequest({
      id: crypto.randomUUID(),
      text: prompt,
      context,
    })
  }

  return (
    <div className="relative flex h-svh w-full overflow-hidden bg-inset">
      <div className="hidden xl:block">
        <DocumentsSidebar
          documents={documents}
          folders={folders}
          activeDocumentId={document.id}
          onNewDocument={() => void createBlank()}
        />
      </div>

      <main className="min-w-0 flex-1 p-2 xl:pl-0">
        <div className="relative flex h-full min-w-0 overflow-hidden rounded-window bg-surface shadow-card">
          <DocumentEditor
            ref={editorRef}
            document={document}
            currentUser={currentUser}
            onSaved={setDocument}
            onSelectionPrompt={sendSelectionPrompt}
          />

          {agentOpen && (
            <aside
              className={cn(
                "absolute inset-0 z-40 min-w-0 bg-surface sm:inset-y-0 sm:left-auto sm:w-[min(390px,44vw)] sm:border-l sm:border-line lg:relative lg:z-auto lg:w-[var(--agent-width)] lg:shrink-0",
                !isResizingAgent &&
                  "lg:transition-[width] lg:duration-150 lg:ease-linear"
              )}
              style={{ "--agent-width": agentWidth } as CSSProperties}
            >
              <button
                ref={dragRef}
                type="button"
                aria-label="Resize Loop assistant"
                title="Resize Loop assistant"
                tabIndex={-1}
                onMouseDown={handleMouseDown}
                className="group/rail absolute inset-y-0 left-0 z-50 hidden w-4 -translate-x-1/2 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:transition-colors hover:after:bg-line-strong lg:block"
              />
              <DocumentAgent
                scope="document"
                documentId={document.id}
                pendingRequest={pendingAgentRequest}
                onPendingRequestHandled={(id) =>
                  setPendingAgentRequest((current) =>
                    current?.id === id ? null : current
                  )
                }
                onBeforeSend={async () => {
                  await editorRef.current?.flush()
                }}
                executeEditorTool={async (tool) => {
                  const editor = editorRef.current
                  if (!editor) {
                    return { ok: false, error: "The editor is not mounted." }
                  }
                  return editor.executeTool(tool)
                }}
                onEditorEditSettled={() =>
                  editorRef.current?.clearAgentSelectionAnchor()
                }
                onMutated={(mutation) => void handleMutation(mutation)}
                onClose={() => {
                  editorRef.current?.clearAgentSelectionAnchor()
                  setAgentOpen(false)
                }}
              />
              {agentRefreshing && (
                <div className="pointer-events-none absolute inset-x-3 top-14 z-10 rounded-control bg-inset px-3 py-2 text-center text-[11px] text-ink-3 shadow-card">
                  Refreshing the edited document…
                </div>
              )}
            </aside>
          )}

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
    </div>
  )
}
