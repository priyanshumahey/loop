"use client"

import {
  ChevronDownIcon,
  DownloadIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  PaperclipIcon,
  ReplyIcon,
} from "lucide-react"
import { format } from "date-fns"
import { useCallback, useMemo, useState } from "react"

import { RenderedEmailHtml } from "@/components/email/html-frame"
import { avatarTint, formatBytes, initials } from "@/components/email/utils"
import {
  MEMBER_LIST,
  messageText,
  type Address,
  type Member,
  type MessageAttachment,
  type ThreadMessage,
} from "@/components/teams/mock-data"
import { RelativeTime } from "@/components/teams/relative-time"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/** Everything above this many messages folds into a "…earlier" bar, like Gmail. */
const COLLAPSE_THRESHOLD = 3

const MEMBER_BY_EMAIL = new Map(MEMBER_LIST.map((member) => [member.email, member]))

/**
 * Absolute timestamps are formatted in the viewer's timezone, which the server
 * doesn't know — render it, but let the client's version win without a warning.
 */
function AbsoluteTime({ value }: { value: string }) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {format(new Date(value), "d MMM yyyy, HH:mm")}
    </time>
  )
}

function Avatar({ address, size = 8 }: { address: Address; size?: 7 | 8 }) {
  const member = MEMBER_BY_EMAIL.get(address.email)
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        member?.tint ?? avatarTint(address.email),
        size === 8 ? "size-8 text-[11px]" : "size-7 text-[10px]"
      )}
    >
      {member?.initials ?? initials(address.name || address.email)}
    </span>
  )
}

/** "me", or a first name — how mail clients label a recipient in the header. */
function shortName(address: Address, meEmail: string): string {
  if (address.email === meEmail) return "me"
  return address.name.split(" ")[0] || address.email
}

function recipientLine(message: ThreadMessage, meEmail: string): string {
  const names = [...message.to, ...(message.cc ?? [])].map((address) =>
    shortName(address, meEmail)
  )
  if (names.length === 0) return "to (no recipients)"
  if (names.length <= 3) return `to ${names.join(", ")}`
  return `to ${names.slice(0, 2).join(", ")} and ${names.length - 2} others`
}

function AddressRow({ label, list }: { label: string; list: Address[] }) {
  if (list.length === 0) return null
  return (
    <>
      <dt className="text-right text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 text-foreground">
        {list.map((address) => (
          <span className="block truncate" key={address.email}>
            {address.name ? `${address.name} ` : ""}
            <span className="text-muted-foreground">
              &lt;{address.email}&gt;
            </span>
          </span>
        ))}
      </dd>
    </>
  )
}

/** The full envelope, the way every mail client hides it behind a caret. */
function EnvelopeDetails({
  message,
  subject,
}: {
  message: ThreadMessage
  subject: string
}) {
  return (
    <PopoverContent align="start" className="w-[22rem] p-3">
      <dl className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2.5 gap-y-1 text-[11px] leading-relaxed">
        <AddressRow label="from" list={[message.from]} />
        <AddressRow label="to" list={message.to} />
        <AddressRow label="cc" list={message.cc ?? []} />
        <dt className="text-right text-muted-foreground">date:</dt>
        <dd className="text-foreground">
          <AbsoluteTime value={message.sentAt} />
        </dd>
        <dt className="text-right text-muted-foreground">subject:</dt>
        <dd className="truncate text-foreground">{subject}</dd>
      </dl>
    </PopoverContent>
  )
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="size-4" />
  if (mimeType === "application/pdf") return <FileTextIcon className="size-4" />
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return <FileSpreadsheetIcon className="size-4" />
  }
  return <FileIcon className="size-4" />
}

function AttachmentCard({ attachment }: { attachment: MessageAttachment }) {
  return (
    <button
      className="group flex w-56 items-center gap-2.5 rounded-lg border border-border/70 bg-background px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
      onClick={() =>
        window.alert(
          `Prototype only — ${attachment.filename} isn't a real file yet.`
        )
      }
      title={`${attachment.filename} · ${formatBytes(attachment.size)}`}
      type="button"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <AttachmentIcon mimeType={attachment.mimeType} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium">
          {attachment.filename}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatBytes(attachment.size)}
        </span>
      </span>
      <DownloadIcon className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
    </button>
  )
}

function CollapsedMessage({
  message,
  meEmail,
  onExpand,
}: {
  message: ThreadMessage
  meEmail: string
  onExpand: () => void
}) {
  return (
    <button
      className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/40"
      onClick={onExpand}
      type="button"
    >
      <Avatar address={message.from} size={7} />
      <span className="shrink-0 text-[12.5px] font-semibold">
        {message.from.email === meEmail ? "me" : message.from.name}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
        {messageText(message)}
      </span>
      {message.attachments?.length ? (
        <PaperclipIcon className="size-3 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="shrink-0 text-[11px] text-muted-foreground">
        <RelativeTime value={message.sentAt} />
      </span>
    </button>
  )
}

function ExpandedMessage({
  message,
  meEmail,
  onCollapse,
  onReply,
  subject,
}: {
  message: ThreadMessage
  meEmail: string
  onCollapse: () => void
  onReply?: (message: ThreadMessage) => void
  subject: string
}) {
  const attachments = message.attachments ?? []

  return (
    <article
      className={cn(
        "px-5 py-4",
        // Outbound mail reads as "ours" at a glance, the way a thread view
        // distinguishes what the team already said from what came in.
        !message.from.external && "bg-muted/25"
      )}
    >
      <header className="flex items-start gap-3">
        <Avatar address={message.from} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[13px] font-semibold">
              {message.from.email === meEmail ? "me" : message.from.name}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              &lt;{message.from.email}&gt;
            </span>
            {message.from.external && (
              <span className="rounded bg-muted px-1 py-px text-[9px] font-medium tracking-wide text-muted-foreground uppercase">
                External
              </span>
            )}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                className="-ml-1 flex max-w-full items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Show envelope details"
                type="button"
              >
                <span className="truncate">
                  {recipientLine(message, meEmail)}
                </span>
                <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
              </button>
            </PopoverTrigger>
            <EnvelopeDetails message={message} subject={subject} />
          </Popover>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <span
            className="px-1 text-[11px] whitespace-nowrap text-muted-foreground"
            title={message.sentAt}
          >
            <AbsoluteTime value={message.sentAt} />
          </span>
          {onReply && (
            <button
              className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => onReply(message)}
              title="Reply in the shared draft"
              type="button"
            >
              <ReplyIcon className="size-3.5" />
            </button>
          )}
          <button
            className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onCollapse}
            title="Collapse message"
            type="button"
          >
            <ChevronDownIcon className="size-3.5 rotate-180" />
          </button>
        </div>
      </header>

      <div className="mt-3 pl-11">
        <RenderedEmailHtml html={message.bodyHtml} title={`Message from ${message.from.name}`} />

        {attachments.length > 0 && (
          <div className="mt-3 border-t border-border/60 pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <PaperclipIcon className="size-3" />
              {attachments.length} attachment
              {attachments.length === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <AttachmentCard attachment={attachment} key={attachment.id} />
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

/**
 * A conversation rendered the way a mail client renders one: the newest message
 * open, everything before it folded down to a one-line summary, and the middle
 * of a long thread hidden behind a count.
 */
export function MessageThread({
  me,
  messages,
  onReply,
  subject,
}: {
  me: Member
  messages: ThreadMessage[]
  onReply?: (message: ThreadMessage) => void
  subject: string
}) {
  const newestId = messages[messages.length - 1]?.id
  const [expanded, setExpanded] = useState<string[]>(() =>
    newestId ? [newestId] : []
  )
  const [showEarlier, setShowEarlier] = useState(
    messages.length <= COLLAPSE_THRESHOLD
  )

  const toggle = useCallback(
    (id: string) =>
      setExpanded((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id]
      ),
    []
  )

  // Only the first and last survive the fold; the count covers the rest.
  const { hidden, visible } = useMemo(() => {
    if (showEarlier || messages.length <= COLLAPSE_THRESHOLD) {
      return { hidden: 0, visible: messages }
    }
    return {
      hidden: messages.length - 2,
      visible: [messages[0], messages[messages.length - 1]],
    }
  }, [messages, showEarlier])

  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-background">
      {visible.map((message, index) => (
        <div key={message.id}>
          {hidden > 0 && index === 1 && (
            <button
              className="flex w-full items-center gap-2 border-b border-border/60 bg-muted/30 px-5 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              onClick={() => setShowEarlier(true)}
              type="button"
            >
              <span className="flex items-center gap-[3px] rounded bg-muted-foreground/20 px-1.5 py-1">
                {[0, 1, 2].map((dot) => (
                  <span
                    aria-hidden
                    className="size-[3px] rounded-full bg-muted-foreground"
                    key={dot}
                  />
                ))}
              </span>
              {hidden} earlier message{hidden === 1 ? "" : "s"}
            </button>
          )}
          {expanded.includes(message.id) ? (
            <ExpandedMessage
              meEmail={me.email}
              message={message}
              onCollapse={() => toggle(message.id)}
              onReply={onReply}
              subject={subject}
            />
          ) : (
            <CollapsedMessage
              meEmail={me.email}
              message={message}
              onExpand={() => toggle(message.id)}
            />
          )}
        </div>
      ))}
    </div>
  )
}
