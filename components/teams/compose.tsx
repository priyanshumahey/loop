"use client"

import {
  ImageIcon,
  PaperclipIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import dynamic from "next/dynamic"
import { useState } from "react"

import type { DraftHandle } from "@/components/teams/draft-editor"
import {
  MEMBERS,
  type Address,
  type Member,
  type SharedThread,
} from "@/components/teams/mock-data"
import { cn } from "@/lib/utils"

// Slate/Yjs touch the DOM and a WebSocket on construction, so keep them client-only.
const DraftEditor = dynamic(
  () => import("@/components/teams/draft-editor").then((m) => m.DraftEditor),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-28 place-items-center border-y border-border/60 text-xs text-muted-foreground">
        Loading shared draft…
      </div>
    ),
  }
)

function AddressChip({ address }: { address: Address }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-0.5 pr-2 pl-1 text-[11px]"
      title={address.email}
    >
      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-background text-[8px] font-semibold text-muted-foreground">
        {(address.name || address.email).slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate font-medium">{address.name || address.email}</span>
    </span>
  )
}

function HeaderRow({
  action,
  children,
  label,
}: {
  action?: React.ReactNode
  children: React.ReactNode
  label: string
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
      <span className="w-8 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {children}
      </div>
      {action}
    </div>
  )
}

/**
 * The reply surface, laid out as a compose window rather than a comment box:
 * the envelope the team is about to put on the wire is visible before it goes,
 * because on a shared mailbox the "from" is somebody else's address.
 */
export function ComposeCard({
  aiWriting,
  me,
  onDraftReady,
  onTypingChange,
  onWriteWithAi,
  thread,
}: {
  aiWriting: boolean
  me: Member
  onDraftReady: (handle: DraftHandle | null) => void
  onTypingChange: (typing: boolean) => void
  onWriteWithAi: () => void
  thread: SharedThread
}) {
  const [replyAll, setReplyAll] = useState(false)
  const [showCc, setShowCc] = useState(false)

  const owner = MEMBERS[thread.sharedBy]
  const sendingAsSelf = owner.id === me.id
  const lastMessage = thread.messages[thread.messages.length - 1]
  const subject = thread.subject.startsWith("Re: ")
    ? thread.subject
    : `Re: ${thread.subject}`

  const to: Address[] = lastMessage?.from.external
    ? [lastMessage.from]
    : [thread.counterparty]

  // Reply-all carries over everyone the last message reached, minus the
  // mailbox we're sending from and whoever is already on the To line.
  const cc: Address[] = replyAll
    ? [...(lastMessage?.to ?? []), ...(lastMessage?.cc ?? [])].filter(
        (address) =>
          address.email !== owner.email &&
          !to.some((recipient) => recipient.email === address.email)
      )
    : []

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-1.5">
        <div className="flex shrink-0 items-center rounded-md bg-background p-0.5 text-[11px] ring-1 ring-border/70 ring-inset">
          {([false, true] as const).map((all) => (
            <button
              className={cn(
                "rounded px-2 py-0.5 font-medium transition-colors",
                replyAll === all
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
              key={String(all)}
              onClick={() => {
                setReplyAll(all)
                if (all) setShowCc(true)
              }}
              type="button"
            >
              {all ? "Reply all" : "Reply"}
            </button>
          ))}
        </div>
        <span className="truncate text-[11px] text-muted-foreground">
          shared draft · everyone on this thread can edit
        </span>
        <div className="flex-1" />
        <button
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          disabled={aiWriting}
          onClick={onWriteWithAi}
          type="button"
        >
          <SparklesIcon className={cn("size-3", aiWriting && "animate-pulse")} />
          {aiWriting ? "Writing…" : "Write with AI"}
        </button>
      </div>

      <HeaderRow label="From">
        <span className="truncate text-[11px]">
          <span className="font-medium">{owner.name}</span>{" "}
          <span className="text-muted-foreground">&lt;{owner.email}&gt;</span>
        </span>
        {!sendingAsSelf && (
          <span
            className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            title={`Sent on ${owner.name.split(" ")[0]}'s behalf, recorded in the audit log`}
          >
            on behalf of {owner.name.split(" ")[0]}
          </span>
        )}
      </HeaderRow>

      <HeaderRow
        action={
          !showCc && (
            <button
              className="shrink-0 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setShowCc(true)}
              type="button"
            >
              Cc/Bcc
            </button>
          )
        }
        label="To"
      >
        {to.map((address) => (
          <AddressChip address={address} key={address.email} />
        ))}
      </HeaderRow>

      {showCc && (
        <HeaderRow label="Cc">
          {cc.length > 0 ? (
            cc.map((address) => (
              <AddressChip address={address} key={address.email} />
            ))
          ) : (
            <span className="text-[11px] text-muted-foreground/70">
              Nobody — switch to Reply all to include the thread
            </span>
          )}
        </HeaderRow>
      )}

      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <span className="w-8 shrink-0 text-[11px] text-muted-foreground">Subj</span>
        <span className="truncate text-[11px] font-medium">{subject}</span>
      </div>

      <DraftEditor
        me={me}
        onActivity={onTypingChange}
        onReady={onDraftReady}
        roomId={`draft:${thread.id}`}
        seedHtml={thread.draftSeed}
      />

      <div className="flex items-center gap-1 px-2 py-2">
        <button
          className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition-opacity hover:opacity-90"
          onClick={() =>
            window.alert(
              `Prototype only — nothing is sent.\n\nIn the real thing this would send from ${owner.email}` +
                (sendingAsSelf
                  ? "."
                  : `, with an audit entry recording that ${me.name} sent it.`)
            )
          }
          type="button"
        >
          <SendIcon className="size-3.5" />
          Send
        </button>
        <button
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Attach a file"
          type="button"
        >
          <PaperclipIcon className="size-3.5" />
        </button>
        <button
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Insert an image"
          type="button"
        >
          <ImageIcon className="size-3.5" />
        </button>
        <div className="flex-1" />
        <button
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          title="Discard the shared draft"
          type="button"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
