"use client"

import {
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react"
import { YjsPlugin } from "@platejs/yjs/react"
import { BoldIcon, ItalicIcon, UnderlineIcon } from "lucide-react"
import { PlateContainer, PlateContent, Plate, usePlateEditor, usePluginOption } from "platejs/react"
import { useEffect } from "react"

import { RemoteCursorOverlay } from "@/components/teams/remote-cursor-overlay"
import type { Member } from "@/components/teams/mock-data"
import { cn } from "@/lib/utils"

const COLLAB_URL =
  process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://127.0.0.1:8888"

export interface DraftHandle {
  /** Append paragraphs to the shared draft; all collaborators see them appear. */
  insertParagraphs: (paragraphs: string[]) => void
  /** Swap the whole draft for a new one. Undoable with the editor's own history. */
  replaceParagraphs: (paragraphs: string[]) => void
  /** The draft as it stands right now, for giving the assistant context. */
  getText: () => string
}

/**
 * A shared email draft backed by a Yjs document. Every participant in the same
 * `roomId` edits the same CRDT, so edits merge without a lock and without a
 * server-side merge step. The draft body is deliberately NOT React state — Yjs
 * owns it, which is why the editor is created with `skipInitialization`.
 */
export function DraftEditor({
  roomId,
  me,
  seedHtml,
  onActivity,
  onReady,
}: {
  roomId: string
  me: Member
  seedHtml: string
  /** Fires when this person focuses or leaves the draft, for the presence dot. */
  onActivity?: (active: boolean) => void
  /** Hands an imperative insert handle up so the assistant can write here. */
  onReady?: (handle: DraftHandle | null) => void
}) {
  const editor = usePlateEditor(
    {
      plugins: [
        BoldPlugin,
        ItalicPlugin,
        UnderlinePlugin,
        YjsPlugin.configure({
          render: { afterEditable: RemoteCursorOverlay },
          options: {
            cursors: { data: { name: me.name, color: me.color } },
            providers: [
              {
                type: "hocuspocus",
                options: { name: roomId, url: COLLAB_URL },
              },
            ],
          },
        }),
      ],
      // Yjs owns the initial document state, not Plate.
      skipInitialization: true,
    },
    // Rebuild the editor when the room or the acting user changes.
    [roomId, me.id]
  )

  useEffect(() => {
    const api = editor.getApi(YjsPlugin)
    let cancelled = false
    let connected = false

    // Deferred by a tick so React Strict Mode's double-invoke cancels the first
    // pass before it opens a socket — connecting twice throws "already connected".
    const timer = setTimeout(() => {
      if (cancelled) return
      connected = true
      void api.yjs.init({ id: roomId, value: seedHtml })
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (connected) api.yjs.destroy()
    }
  }, [editor, roomId, seedHtml])

  useEffect(() => {
    const toParagraphs = (paragraphs: string[]) =>
      paragraphs.map((text) => ({ type: "p", children: [{ text }] }))

    onReady?.({
      insertParagraphs: (paragraphs) => {
        editor.tf.insertNodes(toParagraphs(paragraphs), {
          at: [editor.children.length],
        })
      },
      replaceParagraphs: (paragraphs) => {
        // Append first, then drop the old blocks, so the document is never
        // momentarily empty (which Slate normalisation would fight).
        const previous = editor.children.length
        editor.tf.insertNodes(toParagraphs(paragraphs), { at: [previous] })
        for (let i = previous - 1; i >= 0; i--) {
          editor.tf.removeNodes({ at: [i] })
        }
      },
      getText: () =>
        editor.children
          .map((node) => editor.api.string(node as never))
          .join("\n")
          .trim(),
    })
    return () => onReady?.(null)
  }, [editor, onReady])

  return (
    <Plate editor={editor}>
      {/* Frameless: the compose card that hosts this owns the border. */}
      <div className="flex flex-col bg-background">
        <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
          <MarkButton icon={BoldIcon} label="Bold" nodeType="bold" />
          <MarkButton icon={ItalicIcon} label="Italic" nodeType="italic" />
          <MarkButton icon={UnderlineIcon} label="Underline" nodeType="underline" />
          <div className="flex-1" />
          <ConnectionBadge />
        </div>
        <PlateContainer className="relative max-h-64 min-h-28 cursor-text overflow-y-auto">
          <PlateContent
            // Plate renders blocks as divs, so space the slate elements rather than `p`.
            className="min-h-28 px-4 py-3 text-[13px] leading-relaxed outline-none [&>[data-slate-node=element]]:mb-2.5 [&>[data-slate-node=element]:last-child]:mb-0 [&_strong]:font-semibold"
            onBlur={() => onActivity?.(false)}
            onFocus={() => onActivity?.(true)}
            placeholder="Write the reply together…"
          />
        </PlateContainer>
      </div>
    </Plate>
  )
}

function MarkButton({
  icon: Icon,
  label,
  nodeType,
}: {
  icon: typeof BoldIcon
  label: string
  nodeType: string
}) {
  const editor = usePlateEditor()

  return (
    <button
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onMouseDown={(event) => {
        event.preventDefault()
        editor.tf.toggleMark(nodeType)
      }}
      title={label}
      type="button"
    >
      <Icon className="size-3.5" />
    </button>
  )
}

function ConnectionBadge() {
  const isConnected = usePluginOption(YjsPlugin, "_isConnected")
  const isSynced = usePluginOption(YjsPlugin, "_isSynced")

  const state = !isConnected ? "offline" : isSynced ? "live" : "syncing"
  const label =
    state === "live" ? "Live" : state === "syncing" ? "Syncing…" : "Offline"

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
        state === "live" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
        state === "syncing" && "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
        state === "offline" && "bg-muted text-muted-foreground"
      )}
      title={
        state === "offline"
          ? "Collab server not reachable — run `bun run collab`"
          : undefined
      }
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "live" && "bg-emerald-500",
          state === "syncing" && "bg-amber-500 animate-pulse",
          state === "offline" && "bg-muted-foreground/50"
        )}
      />
      {label}
    </span>
  )
}
