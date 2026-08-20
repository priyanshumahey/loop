"use client"

import type { YHistoryEditor } from "@platejs/yjs"
import { YjsPlugin } from "@platejs/yjs/react"
import {
  CheckIcon,
  ChevronLeftIcon,
  CircleAlertIcon,
  RefreshCwIcon,
  ScissorsIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react"
import Link from "next/link"
import {
  KEYS,
  NodeApi,
  RangeApi,
  type RangeRef,
  type TElement,
  type TRange,
  type Value,
} from "platejs"
import { Plate, useEditorSelector, usePlateEditor } from "platejs/react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

import {
  AutoformatProvider,
  useAutoformat,
} from "@/components/editor/autoformat-context"
import { LineNumbersProvider } from "@/components/editor/line-numbers-context"
import { RemoteCursorOverlay } from "@/components/editor/ui/remote-cursor-overlay"
import { CollaboratorAvatars } from "@/components/documents/collaborator-avatars"
import { createDocumentEditorKit } from "@/components/documents/document-editor-kit"
import { DocumentHistoryDialog } from "@/components/documents/document-history-dialog"
import { DocumentToolbar } from "@/components/documents/document-toolbar"
import { Editor, EditorContainer } from "@/components/ui/editor"
import {
  createDocumentCheckpoint,
  updateDocument,
} from "@/lib/api/documents"
import { getEmail } from "@/lib/api/emails"
import { getEvent } from "@/lib/api/events"
import {
  cursorColorForUser,
  getCollaborationToken,
  getCollaborationUrl,
} from "@/lib/collaboration"
import {
  type EditorSnapshot,
  type EditorToolInput,
  type EditorToolResult,
  type SelectedTextContext,
} from "@/lib/document-agent/editor-tools"
import {
  embedNodeText,
  EMAIL_EMBED_KEY,
  EVENT_EMBED_KEY,
  insertSourceEmbed,
  isEmailEmbedElement,
  isEventEmbedElement,
  projectEmbedsForMarkdown,
  toEmailEmbedSnapshot,
  toEventEmbedSnapshot,
  type TSourceEmbedElement,
} from "@/lib/document-embeds"
import type { DocumentRevision, LoopDocument } from "@/lib/documents"

type SaveState = "saved" | "dirty" | "saving" | "error"

export interface DocumentEditorHandle {
  flush: () => Promise<void>
  executeTool: (tool: EditorToolInput) => Promise<EditorToolResult>
  clearAgentSelectionAnchor: () => void
}

interface SelectionAction {
  text: string
  left: number
  top: number
  range: TRange
}

interface DocumentEditorProps {
  document: LoopDocument
  currentUser: { id: string; email: string; name: string }
  onSaved: (document: LoopDocument) => void
  onSelectionPrompt: (prompt: string, context: SelectedTextContext) => void
}

export const DocumentEditor = forwardRef<DocumentEditorHandle, DocumentEditorProps>(
  function DocumentEditor(props, ref) {
    return (
      <LineNumbersProvider>
        <AutoformatProvider>
          <DocumentEditorInner {...props} ref={ref} />
        </AutoformatProvider>
      </LineNumbersProvider>
    )
  }
)

const DocumentEditorInner = forwardRef<DocumentEditorHandle, DocumentEditorProps>(
  function DocumentEditorInner(
  { document, currentUser, onSaved, onSelectionPrompt },
  ref
) {
  const { isEnabled } = useAutoformat()
  const canEdit = document.role !== "viewer"
  const [title, setTitle] = useState(document.title)
  const [initialContent] = useState(document.content)
  const [editorSessionId] = useState(() => crypto.randomUUID())
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [collaborationStatus, setCollaborationStatus] = useState<
    "connecting" | "synced" | "offline" | "error"
  >("connecting")
  const [collaborationError, setCollaborationError] = useState<string | null>(null)
  const [selection, setSelection] = useState<SelectionAction | null>(null)
  const editorHostRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingValueRef = useRef<Value>(document.content)
  const pendingSyncSaveRef = useRef(false)
  const editRevisionRef = useRef(0)
  const queuedRevisionRef = useRef(0)
  const savedRevisionRef = useRef(0)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const collaborationLifecycleRef = useRef<Promise<void>>(Promise.resolve())
  const agentSelectionAnchorRef = useRef<{
    range: RangeRef
    revision: string
  } | null>(null)

  const editorRevision = useCallback(
    () => `${editorSessionId}:${editRevisionRef.current}`,
    [editorSessionId]
  )

  const clearAgentSelectionAnchor = useCallback(() => {
    agentSelectionAnchorRef.current?.range.unref()
    agentSelectionAnchorRef.current = null
  }, [])

  const handleCollaborationConnect = useCallback(() => {
    setCollaborationStatus("connecting")
    setCollaborationError(null)
  }, [])
  const handleCollaborationDisconnect = useCallback(() => {
    setCollaborationStatus("offline")
  }, [])
  const handleCollaborationSync = useCallback(
    ({ isSynced }: { isSynced: boolean }) => {
      setCollaborationStatus(isSynced ? "synced" : "connecting")
      if (isSynced) setCollaborationError(null)
    },
    []
  )
  const handleCollaborationError = useCallback(
    ({ error }: { error: Error }) => {
      setCollaborationStatus("error")
      setCollaborationError(error.message || "Collaboration failed")
    },
    []
  )

  const [plugins] = useState(() => [
    ...createDocumentEditorKit(isEnabled),
    YjsPlugin.configure({
      render: { afterEditable: RemoteCursorOverlay },
      options: {
        cursors: {
          data: {
            name: currentUser.name || currentUser.email,
            color: cursorColorForUser(currentUser.id),
          },
        },
        providers: [
          {
            type: "hocuspocus" as const,
            options: {
              name: document.id,
              url: getCollaborationUrl(),
              token: getCollaborationToken,
            },
          },
        ],
        onConnect: handleCollaborationConnect,
        onDisconnect: handleCollaborationDisconnect,
        onSyncChange: handleCollaborationSync,
        onError: handleCollaborationError,
      },
    }),
  ])
  const editor = usePlateEditor({
    plugins,
    skipInitialization: true,
    userId: currentUser.id,
  })

  const retryCollaboration = useCallback(() => {
    setCollaborationStatus("connecting")
    setCollaborationError(null)
    const collaboration = editor.getApi(YjsPlugin).yjs
    collaboration.disconnect("hocuspocus")
    collaboration.connect("hocuspocus")
  }, [editor])

  const selectedRangeText = useCallback(
    (range: TRange): string => {
      const [start, end] = RangeApi.edges(range)
      const segments: string[] = []
      for (let blockIndex = start.path[0]; blockIndex <= end.path[0]; blockIndex += 1) {
        const blockStart = editor.api.start([blockIndex])
        const blockEnd = editor.api.end([blockIndex])
        if (!blockStart || !blockEnd) continue
        segments.push(
          editor.api.string({
            anchor: blockIndex === start.path[0] ? start : blockStart,
            focus: blockIndex === end.path[0] ? end : blockEnd,
          })
        )
      }
      return segments.join("\n")
    },
    [editor]
  )

  useEffect(() => {
    let cancelled = false
    let shouldDestroy = false
    const start = collaborationLifecycleRef.current
      .catch(() => undefined)
      .then(async () => {
        if (cancelled) return
        shouldDestroy = true
        await editor.getApi(YjsPlugin).yjs.init({
          id: document.id,
          value: initialContent,
        })
      })
    collaborationLifecycleRef.current = start
    void start.catch((error: unknown) => {
      if (cancelled) return
      setCollaborationStatus("error")
      setCollaborationError(
        error instanceof Error ? error.message : "Collaboration failed"
      )
    })

    return () => {
      cancelled = true
      collaborationLifecycleRef.current = start
        .catch(() => undefined)
        .then(() => {
          if (shouldDestroy) editor.getApi(YjsPlugin).yjs.destroy()
        })
    }
  }, [document.id, editor, initialContent])

  const persistContent = useCallback(
    async (content: Value, revision: number) => {
      if (revision <= savedRevisionRef.current) {
        await saveQueueRef.current
        return true
      }
      if (revision <= queuedRevisionRef.current) {
        await saveQueueRef.current
        if (revision <= savedRevisionRef.current) return true
      }
      queuedRevisionRef.current = revision
      setSaveState("saving")
      let succeeded = false
      const save = saveQueueRef.current.then(async () => {
        try {
          const updated = await updateDocument(document.id, { content })
          succeeded = true
          savedRevisionRef.current = Math.max(savedRevisionRef.current, revision)
          onSaved(updated)
          setSaveState(
            savedRevisionRef.current === editRevisionRef.current ? "saved" : "dirty"
          )
        } catch {
          if (revision === editRevisionRef.current) setSaveState("error")
        }
      })
      saveQueueRef.current = save
      await save
      return succeeded
    },
    [document.id, onSaved]
  )

  const flush = useCallback(async () => {
    if (!canEdit) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    await persistContent(pendingValueRef.current, editRevisionRef.current)
  }, [canEdit, persistContent])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      clearAgentSelectionAnchor()
    }
  }, [clearAgentSelectionAnchor])

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (savedRevisionRef.current === editRevisionRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warnBeforeUnload)
    return () => window.removeEventListener("beforeunload", warnBeforeUnload)
  }, [])

  const updateSelectionActions = useCallback(
    (nextSelection: TRange | null) => {
      if (!nextSelection || RangeApi.isCollapsed(nextSelection)) {
        setSelection(null)
        return
      }
      const text = selectedRangeText(nextSelection)
      if (!text.trim() || text.length > 10_000) {
        setSelection(null)
        return
      }

      requestAnimationFrame(() => {
        const host = editorHostRef.current
        const browserSelection = window.getSelection()
        if (!host || !browserSelection?.rangeCount) return
        const domRange = browserSelection.getRangeAt(0)
        if (!host.contains(domRange.commonAncestorContainer)) return
        const rect = domRange.getBoundingClientRect()
        setSelection({
          text,
          left: Math.min(
            window.innerWidth - 180,
            Math.max(180, rect.left + rect.width / 2)
          ),
          top: Math.min(window.innerHeight - 52, rect.bottom + 10),
          range: nextSelection,
        })
      })
    },
    [selectedRangeText]
  )

  const handleEditorKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const command = event.metaKey || event.ctrlKey
      if (!command || event.altKey) return
      const key = event.key.toLowerCase()

      if (key === "a") {
        event.preventDefault()
        event.stopPropagation()
        const wholeDocument = editor.api.range([])
        if (!wholeDocument) return
        editor.tf.select(wholeDocument)
        editor.tf.focus()
        updateSelectionActions(wholeDocument)
      }

      if (key === "s") {
        event.preventDefault()
        event.stopPropagation()
        void flush()
      }
    },
    [editor, flush, updateSelectionActions]
  )

  const scheduleSave = useCallback(
    (content: Value) => {
      pendingValueRef.current = content
      if (!canEdit) return
      if (collaborationStatus !== "synced") {
        pendingSyncSaveRef.current = true
        return
      }
      const revision = ++editRevisionRef.current
      setSaveState("dirty")
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null
        void persistContent(content, revision)
      }, 800)
    },
    [canEdit, collaborationStatus, persistContent]
  )

  useEffect(() => {
    if (
      !canEdit ||
      collaborationStatus !== "synced" ||
      !pendingSyncSaveRef.current
    ) {
      return
    }
    pendingSyncSaveRef.current = false
    scheduleSave(pendingValueRef.current)
  }, [canEdit, collaborationStatus, scheduleSave])

  const saveTitle = useCallback(async () => {
    if (!canEdit) return
    const next = title.trim() || "Untitled"
    setTitle(next)
    if (next === document.title) return
    setSaveState("saving")
    try {
      const updated = await updateDocument(document.id, { title: next })
      onSaved(updated)
      setSaveState(
        savedRevisionRef.current === editRevisionRef.current ? "saved" : "dirty"
      )
    } catch {
      setSaveState("error")
    }
  }, [canEdit, document.id, document.title, onSaved, title])

  const retrySave = useCallback(async () => {
    const contentSaved = await flush()
    if (!contentSaved) return
    await saveTitle()
  }, [flush, saveTitle])

  const snapshotEditor = useCallback((): EditorSnapshot => {
    const markdown = editor.api.markdown.serialize({
      value: projectEmbedsForMarkdown(editor.children),
    })
    const blocks = editor.children.map((node, index) => {
      const element = node as TElement & {
        checked?: boolean
        indent?: number
        lang?: string
        listStyleType?: string
        texExpression?: string
      }
      let blockMarkdown = ""
      try {
        blockMarkdown = editor.api.markdown.serialize({
          value: projectEmbedsForMarkdown([element]),
        })
      } catch {
        blockMarkdown = embedNodeText(element) ?? NodeApi.string(element)
      }
      const embed = isEventEmbedElement(element)
        ? {
            sourceType: "event" as const,
            sourceId: element.eventId,
            snapshot: element.snapshot,
          }
        : isEmailEmbedElement(element)
          ? {
              sourceType: "email" as const,
              sourceId: element.emailId,
              snapshot: element.snapshot,
            }
          : undefined
      return {
        index,
        type: element.type,
        text: embedNodeText(element) ?? NodeApi.string(element),
        markdown: blockMarkdown,
        ...(embed ? { embed } : {}),
        ...(element.indent !== undefined ? { indent: element.indent } : {}),
        ...(element.listStyleType
          ? { listStyleType: element.listStyleType }
          : {}),
        ...(element.checked !== undefined ? { checked: element.checked } : {}),
        ...(element.lang ? { language: element.lang } : {}),
        ...(element.texExpression
          ? { texExpression: element.texExpression }
          : {}),
      }
    })

    let selection: EditorSnapshot["selection"] = null
    if (editor.selection) {
      let text = ""
      try {
        text = selectedRangeText(editor.selection)
      } catch {
        text = ""
      }
      selection = {
        text,
        startBlock: Math.min(
          editor.selection.anchor.path[0],
          editor.selection.focus.path[0]
        ),
        endBlock: Math.max(
          editor.selection.anchor.path[0],
          editor.selection.focus.path[0]
        ),
      }
    }

    return {
      revision: editorRevision(),
      title,
      markdown,
      wordCount: markdown.trim().split(/\s+/).filter(Boolean).length,
      blocks,
      selection,
    }
  }, [editor, editorRevision, selectedRangeText, title])

  const flushEditorValue = useCallback(async () => {
    pendingValueRef.current = editor.children as Value
    editRevisionRef.current += 1
    setSaveState("dirty")
    await persistContent(pendingValueRef.current, editRevisionRef.current)
  }, [editor, persistContent])

  const applyUndoableMutation = useCallback(
    (mutation: () => void) => {
      const yjsEditor = editor as typeof editor & YHistoryEditor
      yjsEditor.flushLocalChanges()
      yjsEditor.undoManager.stopCapturing()
      try {
        editor.tf.withNewBatch(() => {
          editor.tf.withoutNormalizing(mutation)
        })
        yjsEditor.flushLocalChanges()
      } finally {
        yjsEditor.undoManager.stopCapturing()
      }
    },
    [editor]
  )

  const executeTool = useCallback(
    async (tool: EditorToolInput): Promise<EditorToolResult> => {
      if (tool.toolName === "inspectEditor") {
        clearAgentSelectionAnchor()
        if (editor.selection && !RangeApi.isCollapsed(editor.selection)) {
          agentSelectionAnchorRef.current = {
            range: editor.api.rangeRef(editor.selection, { affinity: "inward" }),
            revision: editorRevision(),
          }
        }
        return { ok: true, ...snapshotEditor() }
      }

      if (!canEdit) {
        return { ok: false, error: "This document is view-only." }
      }

      const expectedRevision =
        "expectedRevision" in tool.input
          ? tool.input.expectedRevision
          : undefined
      const staleRevision = () =>
        expectedRevision !== undefined && expectedRevision !== editorRevision()
      const staleResult = (): EditorToolResult => ({
        ok: false,
        error: "The editor changed after inspection. Inspect it again before applying this edit.",
      })

      if (staleRevision()) return staleResult()

      try {
        await flush()
        await createDocumentCheckpoint(document.id, "agent")
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to create an edit checkpoint.",
        }
      }

      if (staleRevision()) return staleResult()

      if (tool.toolName === "renameEditorDocument") {
        const nextTitle = tool.input.title.trim()
        setTitle(nextTitle)
        setSaveState("saving")
        try {
          const updated = await updateDocument(document.id, { title: nextTitle })
          onSaved(updated)
          setSaveState(
            savedRevisionRef.current === editRevisionRef.current
              ? "saved"
              : "dirty"
          )
          return { ok: true, title: updated.title, documentId: updated.id }
        } catch (error) {
          setSaveState("error")
          return {
            ok: false,
            error: error instanceof Error ? error.message : "Rename failed",
          }
        }
      }

      if (tool.toolName === "replaceSelection") {
        const anchoredSelection = agentSelectionAnchorRef.current
        const useAnchoredSelection =
          anchoredSelection?.revision === tool.input.expectedRevision
        const targetSelection = useAnchoredSelection
          ? anchoredSelection.range.current
          : editor.selection
        if (!targetSelection || RangeApi.isCollapsed(targetSelection)) {
          return { ok: false, error: "There is no active text selection." }
        }
        applyUndoableMutation(() => {
          editor.tf.insertText(tool.input.replacement, { at: targetSelection })
        })
        if (useAnchoredSelection) clearAgentSelectionAnchor()
        await flushEditorValue()
        return {
          ok: true,
          changeSummary: tool.input.changeSummary,
          replacement: tool.input.replacement,
        }
      }

      const validRange = (startIndex: number, endIndex: number) =>
        startIndex >= 0 &&
        endIndex >= startIndex &&
        endIndex < editor.children.length

      if (tool.toolName === "insertBlocks") {
        const nodes = editor.api.markdown.deserialize(tool.input.markdown)
        if (!nodes.length) return { ok: false, error: "No blocks to insert." }
        let index = 0
        if (tool.input.position === "end") index = editor.children.length
        if (
          tool.input.position === "beforeBlock" ||
          tool.input.position === "afterBlock"
        ) {
          if (
            tool.input.blockIndex === undefined ||
            tool.input.blockIndex >= editor.children.length
          ) {
            return { ok: false, error: "The anchor block no longer exists." }
          }
          index =
            tool.input.blockIndex +
            (tool.input.position === "afterBlock" ? 1 : 0)
        }
        applyUndoableMutation(() => {
          editor.tf.insertNodes(nodes, { at: [index], select: true })
        })
        await flushEditorValue()
        return {
          ok: true,
          changeSummary: tool.input.changeSummary,
          insertedAt: index,
          insertedBlocks: nodes.length,
        }
      }

      if (
        tool.toolName === "embedCalendarEvent" ||
        tool.toolName === "embedEmail"
      ) {
        let index = tool.input.position === "start" ? 0 : editor.children.length
        if (
          tool.input.position === "beforeBlock" ||
          tool.input.position === "afterBlock"
        ) {
          const blockIndex = tool.input.blockIndex
          if (
            blockIndex === undefined ||
            blockIndex >= editor.children.length
          ) {
            return { ok: false, error: "The anchor block no longer exists." }
          }
          index =
            blockIndex + (tool.input.position === "afterBlock" ? 1 : 0)
        }

        let embed: TSourceEmbedElement
        try {
          if (tool.toolName === "embedCalendarEvent") {
            const event = await getEvent(tool.input.eventId)
            embed = {
              type: EVENT_EMBED_KEY,
              eventId: event.id,
              snapshot: toEventEmbedSnapshot(event),
              children: [{ text: "" }],
            }
          } else {
            const email = await getEmail(tool.input.emailId)
            embed = {
              type: EMAIL_EMBED_KEY,
              emailId: email.id,
              snapshot: toEmailEmbedSnapshot(email),
              children: [{ text: "" }],
            }
          }
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load the embedded source.",
          }
        }

        if (staleRevision()) return staleResult()

        let insertedAt = index
        applyUndoableMutation(() => {
          insertedAt = insertSourceEmbed(editor, embed, index)
        })
        await flushEditorValue()
        return {
          ok: true,
          changeSummary: tool.input.changeSummary,
          insertedAt,
          sourceType:
            tool.toolName === "embedCalendarEvent" ? "event" : "email",
          sourceId:
            embed.type === EVENT_EMBED_KEY ? embed.eventId : embed.emailId,
          sourceLabel:
            embed.type === EVENT_EMBED_KEY
              ? embed.snapshot.title
              : embed.snapshot.subject,
        }
      }

      if (tool.toolName === "updateEmbeddedCalendarEvent") {
        const index = tool.input.blockIndex
        const current = editor.children[index]
        if (
          !isEventEmbedElement(current) ||
          current.eventId !== tool.input.expectedSourceId
        ) {
          return {
            ok: false,
            error:
              "The calendar event embed at that block changed. Inspect the editor again.",
          }
        }
        let replacement: TSourceEmbedElement
        try {
          const event = await getEvent(tool.input.eventId)
          replacement = {
            type: EVENT_EMBED_KEY,
            eventId: event.id,
            snapshot: toEventEmbedSnapshot(event),
            children: [{ text: "" }],
          }
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load the calendar event.",
          }
        }
        if (staleRevision()) return staleResult()
        const latest = editor.children[index]
        if (
          !isEventEmbedElement(latest) ||
          latest.eventId !== tool.input.expectedSourceId
        ) {
          return {
            ok: false,
            error:
              "The calendar event embed at that block changed. Inspect the editor again.",
          }
        }
        applyUndoableMutation(() => {
          editor.tf.removeNodes({ at: [index] })
          editor.tf.insertNodes(replacement, { at: [index] })
        })
        await flushEditorValue()
        return {
          ok: true,
          changeSummary: tool.input.changeSummary,
          blockIndex: index,
          sourceType: "event",
          sourceId: replacement.eventId,
          sourceLabel: replacement.snapshot.title,
        }
      }

      if (tool.toolName === "updateEmbeddedEmail") {
        const index = tool.input.blockIndex
        const current = editor.children[index]
        if (
          !isEmailEmbedElement(current) ||
          current.emailId !== tool.input.expectedSourceId
        ) {
          return {
            ok: false,
            error:
              "The email embed at that block changed. Inspect the editor again.",
          }
        }
        let replacement: TSourceEmbedElement
        try {
          const email = await getEmail(tool.input.emailId)
          replacement = {
            type: EMAIL_EMBED_KEY,
            emailId: email.id,
            snapshot: toEmailEmbedSnapshot(email),
            children: [{ text: "" }],
          }
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load the email.",
          }
        }
        if (staleRevision()) return staleResult()
        const latest = editor.children[index]
        if (
          !isEmailEmbedElement(latest) ||
          latest.emailId !== tool.input.expectedSourceId
        ) {
          return {
            ok: false,
            error:
              "The email embed at that block changed. Inspect the editor again.",
          }
        }
        applyUndoableMutation(() => {
          editor.tf.removeNodes({ at: [index] })
          editor.tf.insertNodes(replacement, { at: [index] })
        })
        await flushEditorValue()
        return {
          ok: true,
          changeSummary: tool.input.changeSummary,
          blockIndex: index,
          sourceType: "email",
          sourceId: replacement.emailId,
          sourceLabel: replacement.snapshot.subject,
        }
      }

      if (tool.toolName === "removeSourceEmbed") {
        const index = tool.input.blockIndex
        const current = editor.children[index]
        const matches =
          tool.input.sourceType === "event"
            ? isEventEmbedElement(current) &&
              current.eventId === tool.input.expectedSourceId
            : isEmailEmbedElement(current) &&
              current.emailId === tool.input.expectedSourceId
        if (!matches) {
          return {
            ok: false,
            error:
              "The embedded source at that block changed. Inspect the editor again.",
          }
        }
        applyUndoableMutation(() => {
          editor.tf.removeNodes({ at: [index] })
          if (editor.children.length === 0) {
            editor.tf.insertNodes(
              { type: KEYS.p, children: [{ text: "" }] },
              { at: [0] }
            )
          }
          const targetIndex = Math.min(index, editor.children.length - 1)
          const target = editor.api.start([targetIndex])
          if (target) editor.tf.select(target)
        })
        await flushEditorValue()
        return {
          ok: true,
          changeSummary: tool.input.changeSummary,
          blockIndex: index,
          sourceType: tool.input.sourceType,
          sourceId: tool.input.expectedSourceId,
          removedFromDocument: true,
          sourceDeleted: false,
        }
      }

      if (tool.toolName === "replaceEditorDocument") {
        const nodes = editor.api.markdown.deserialize(tool.input.markdown)
        if (!nodes.length) return { ok: false, error: "The replacement is empty." }
        applyUndoableMutation(() => editor.tf.setValue(nodes))
        await flushEditorValue()
        return {
          ok: true,
          changeSummary: tool.input.changeSummary,
          blockCount: nodes.length,
        }
      }

      const { startIndex, endIndex } = tool.input
      if (!validRange(startIndex, endIndex)) {
        return { ok: false, error: "The requested block range no longer exists." }
      }

      if (tool.toolName === "deleteBlocks") {
        applyUndoableMutation(() => {
          for (let index = endIndex; index >= startIndex; index -= 1) {
            editor.tf.removeNodes({ at: [index] })
          }
          if (editor.children.length === 0) {
            editor.tf.insertNodes(
              { type: KEYS.p, children: [{ text: "" }] },
              { at: [0], select: true }
            )
          }
        })
        await flushEditorValue()
        return {
          ok: true,
          changeSummary: tool.input.changeSummary,
          deletedBlocks: endIndex - startIndex + 1,
        }
      }

      const nodes = editor.api.markdown.deserialize(tool.input.markdown)
      if (!nodes.length) return { ok: false, error: "The replacement is empty." }
      applyUndoableMutation(() => {
        for (let index = endIndex; index >= startIndex; index -= 1) {
          editor.tf.removeNodes({ at: [index] })
        }
        editor.tf.insertNodes(nodes, { at: [startIndex], select: true })
      })
      await flushEditorValue()
      return {
        ok: true,
        changeSummary: tool.input.changeSummary,
        startIndex,
        replacedBlocks: endIndex - startIndex + 1,
        insertedBlocks: nodes.length,
      }
    },
    [
      applyUndoableMutation,
      canEdit,
      clearAgentSelectionAnchor,
      document.id,
      editor,
      editorRevision,
      flush,
      flushEditorValue,
      onSaved,
      selectedRangeText,
      snapshotEditor,
    ]
  )

  useImperativeHandle(
    ref,
    () => ({
      clearAgentSelectionAnchor,
      executeTool,
      flush: async () => {
        await flush()
      },
    }),
    [clearAgentSelectionAnchor, executeTool, flush]
  )

  const restoreRevision = useCallback(
    async (revision: DocumentRevision) => {
      if (!canEdit || collaborationStatus !== "synced") {
        throw new Error("The live document must be connected before restoring.")
      }
      await createDocumentCheckpoint(document.id, "restore")
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      setTitle(revision.title)
      applyUndoableMutation(() => editor.tf.setValue(revision.content))
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      pendingValueRef.current = revision.content
      const nextRevision = ++editRevisionRef.current
      await updateDocument(document.id, { title: revision.title })
      await persistContent(revision.content, nextRevision)
    },
    [
      applyUndoableMutation,
      canEdit,
      collaborationStatus,
      document.id,
      editor,
      persistContent,
    ]
  )

  const askAboutSelection = (action: "improve" | "shorten" | "tone") => {
    if (!selection) return
    clearAgentSelectionAnchor()
    agentSelectionAnchorRef.current = {
      range: editor.api.rangeRef(selection.range, { affinity: "inward" }),
      revision: editorRevision(),
    }
    editor.tf.select(selection.range)
    editor.tf.focus()
    const instruction =
      action === "improve"
        ? "Improve this selected passage for clarity and flow"
        : action === "shorten"
          ? "Shorten this selected passage without losing its meaning"
          : "Rewrite this selected passage in a confident, natural tone"
    onSelectionPrompt(
      `${instruction}.`,
      {
        text: selection.text,
        startBlock: Math.min(
          selection.range.anchor.path[0],
          selection.range.focus.path[0]
        ),
        endBlock: Math.max(
          selection.range.anchor.path[0],
          selection.range.focus.path[0]
        ),
        intent: action,
      }
    )
    setSelection(null)
  }

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col bg-inset">
      <Plate
        editor={editor}
        onValueChange={({ value }) => scheduleSave(value)}
        onSelectionChange={({ selection: nextSelection }) =>
          updateSelectionActions(nextSelection)
        }
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:px-4">
          <Link
            href="/documents"
            aria-label="Back to documents"
            className="grid size-8 shrink-0 place-items-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            <ChevronLeftIcon className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(event) => {
                if (!canEdit) return
                setTitle(event.target.value)
                setSaveState(
                  event.target.value === document.title &&
                    savedRevisionRef.current === editRevisionRef.current
                    ? "saved"
                    : "dirty"
                )
              }}
              onBlur={() => void saveTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
              }}
              aria-label="Document title"
              readOnly={!canEdit}
              className="block h-6 w-full truncate bg-transparent font-heading text-[15px] font-semibold text-ink outline-none read-only:cursor-default"
            />
            <div className="flex items-center gap-2">
              {canEdit && (
                <SaveIndicator
                  state={saveState}
                  onRetry={() => void retrySave()}
                />
              )}
              <CollaborationIndicator
                status={collaborationStatus}
                error={collaborationError}
                role={document.role}
              />
            </div>
          </div>
          <CollaboratorAvatars />
          {document.role === "owner" && (
            <>
              <DocumentHistoryDialog
                documentId={document.id}
                onRestore={restoreRevision}
              />
            </>
          )}
          {document.role !== "owner" && (
            <span className="rounded-full bg-field px-2 py-1 text-[10px] font-medium capitalize text-ink-3 shadow-hairline">
              {document.role}
            </span>
          )}
        </header>

        {canEdit && collaborationStatus === "synced" && <DocumentToolbar />}

        <div ref={editorHostRef} className="relative min-h-0 flex-1 overflow-y-auto px-2 py-5 sm:px-5 sm:py-7">
          {collaborationStatus !== "synced" && (
            <div className="absolute inset-0 z-30 flex items-start justify-center bg-inset/80 pt-20 backdrop-blur-[1px]">
              <div className="rounded-card bg-surface px-4 py-3 text-center shadow-card">
                <p className="loop-shimmer text-[12px] font-medium">
                  {collaborationStatus === "error"
                    ? "Unable to join the live document"
                    : collaborationStatus === "offline"
                      ? "Reconnecting to the live document"
                      : "Syncing live document"}
                </p>
                {collaborationError && (
                  <p className="mt-1 max-w-xs text-[10px] text-destructive">
                    {collaborationError}
                  </p>
                )}
                {(collaborationStatus === "offline" ||
                  collaborationStatus === "error") && (
                  <button
                    type="button"
                    onClick={retryCollaboration}
                    className="mx-auto mt-2 inline-flex h-7 items-center gap-1.5 rounded-control bg-ink px-2.5 text-[11px] font-medium text-canvas transition-opacity hover:opacity-90"
                  >
                    <RefreshCwIcon className="size-3" /> Retry connection
                  </button>
                )}
              </div>
            </div>
          )}
          <EditorContainer className="mx-auto h-auto! min-h-[11in] w-[min(8.5in,100%)] overflow-visible! rounded-[4px] bg-white shadow-raised dark:bg-card">
            <Editor
              variant="none"
              placeholder="Start writing"
              readOnly={!canEdit || collaborationStatus !== "synced"}
              onKeyDown={handleEditorKeyDown}
              className="min-h-[11in] px-[clamp(1.5rem,8vw,1in)] py-[clamp(2rem,8vw,1in)] text-[15px] leading-[1.72] text-[#1d1d1f] dark:text-foreground"
            />
          </EditorContainer>
        </div>
        <div className="pointer-events-none absolute bottom-4 left-4 z-30 flex items-center gap-2 rounded-full bg-surface/90 px-2.5 py-1 text-[10px] text-ink-3 shadow-card backdrop-blur">
          <SelectionIndicator />
        </div>
      </Plate>

      {selection && canEdit && (
        <div
          className="fixed z-50 flex h-9 -translate-x-1/2 items-center gap-0.5 rounded-full bg-surface p-1 text-ink shadow-overlay"
          style={{ left: selection.left, top: selection.top, animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both" }}
        >
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => askAboutSelection("improve")} className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] hover:bg-hover">
            <WandSparklesIcon className="size-3.5" /> Improve
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => askAboutSelection("shorten")} className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] hover:bg-hover">
            <ScissorsIcon className="size-3.5" /> Shorten
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => askAboutSelection("tone")} className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] hover:bg-hover">
            <SparklesIcon className="size-3.5" /> Tone
          </button>
        </div>
      )}
    </div>
  )
  }
)

function SelectionIndicator() {
  const selection = useEditorSelector((editor) => {
    if (!editor.selection) return null
    const startLine =
      Math.min(editor.selection.anchor.path[0], editor.selection.focus.path[0]) + 1
    const endLine =
      Math.max(editor.selection.anchor.path[0], editor.selection.focus.path[0]) + 1
    let selectedText = ""
    try {
      selectedText = editor.api.string(editor.selection)
    } catch {
      selectedText = ""
    }
    return { startLine, endLine, charCount: selectedText.length }
  }, [])

  if (!selection) return <span>Ready</span>
  return (
    <>
      <span className="font-mono tabular-nums">
        {selection.startLine === selection.endLine
          ? `Ln ${selection.startLine}`
          : `Ln ${selection.startLine}–${selection.endLine}`}
      </span>
      {selection.charCount > 0 && (
        <span className="font-mono tabular-nums">
          {selection.charCount} char{selection.charCount === 1 ? "" : "s"}
        </span>
      )}
    </>
  )
}

function SaveIndicator({
  state,
  onRetry,
}: {
  state: SaveState
  onRetry: () => void
}) {
  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 text-[10px] text-destructive hover:underline"
      >
        <CircleAlertIcon className="size-2.5" /> Save failed
      </button>
    )
  }
  if (state === "saved") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-ink-3">
        <CheckIcon className="size-2.5" /> Saved
      </span>
    )
  }
  return (
    <span className="loop-shimmer text-[10px]">
      {state === "saving" ? "Saving…" : "Unsaved changes"}
    </span>
  )
}

function CollaborationIndicator({
  status,
  error,
  role,
}: {
  status: "connecting" | "synced" | "offline" | "error"
  error: string | null
  role: LoopDocument["role"]
}) {
  const label =
    status === "synced"
      ? role === "viewer"
        ? "Live · view only"
        : "Live"
      : status === "offline"
        ? "Offline"
        : status === "error"
          ? "Sync failed"
          : "Connecting"
  return (
    <span
      className={
        status === "synced"
          ? "text-[10px] text-green"
          : status === "error"
            ? "text-[10px] text-destructive"
            : "text-[10px] text-ink-3"
      }
      title={error ?? label}
    >
      {label}
    </span>
  )
}