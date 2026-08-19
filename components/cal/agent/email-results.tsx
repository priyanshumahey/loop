"use client"

import { format, isSameDay, isSameYear } from "date-fns"
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  MailIcon,
  MailOpenIcon,
  MessagesSquareIcon,
  PenLineIcon,
  RotateCcwIcon,
  StarIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { ConnectGoogle } from "@/components/cal/agent/connect-google"
import { avatarTint, formatFullDate, initials } from "@/components/email/utils"
import { AgentCard, AgentNotice, LoadingState } from "@/components/agent"
import * as emailsApi from "@/lib/api/emails"
import type {
  AgentDraft,
  AgentEmail,
  AgentThreadMessage,
  EmailCategory,
} from "@/lib/cal-agent/tools"
import { cn } from "@/lib/utils"

/** Short, human-friendly timestamp for an email card. */
function formatEmailDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const now = new Date()
  if (isSameDay(date, now)) return format(date, "h:mm a")
  if (isSameYear(date, now)) return format(date, "MMM d")
  return format(date, "MMM d, yyyy")
}

const CATEGORY_STYLE: Record<EmailCategory, { label: string; className: string }> = {
  primary: {
    label: "Primary",
    className: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  social: {
    label: "Social",
    className: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  promotions: {
    label: "Promotions",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  updates: {
    label: "Updates",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  forums: {
    label: "Forums",
    className: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
}

/** A colored initials avatar for a sender, tinted deterministically per address. */
function Avatar({
  email,
  size = "md",
}: {
  email: AgentEmail
  size?: "sm" | "md"
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        size === "md" ? "size-8 text-[11px]" : "size-7 text-[10px]",
        avatarTint(email.fromEmail || email.from)
      )}
      aria-hidden
    >
      {initials(email.from)}
    </span>
  )
}

/** Restrained triage signals: importance as a subtle amber marker, and only
 * meaningful (non-default) inbox categories as a neutral chip. */
function EmailBadges({ email }: { email: AgentEmail }) {
  const category =
    email.category && email.category !== "primary"
      ? CATEGORY_STYLE[email.category]
      : null
  if (!category && !email.important) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      {email.important && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-500">
          <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
          Important
        </span>
      )}
      {category && (
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {category.label}
        </span>
      )}
    </div>
  )
}

/**
 * Hand a message off to loop's full reader (only on the mail page, where
 * `onOpen` is wired). We deliberately never link out to Gmail.
 */
function MessageActions({
  email,
  onOpen,
  className,
}: {
  email: AgentEmail
  onOpen?: (email: AgentEmail) => void
  className?: string
}) {
  if (!onOpen) return null
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <button
        type="button"
        onClick={() => onOpen(email)}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary transition-colors hover:underline"
      >
        <MailOpenIcon className="size-3.5" />
        Open in mail
      </button>
    </div>
  )
}

/**
 * A lean inbox row that expands to the full message on click. The body is
 * fetched on first expand so the list stays cheap. On the mail page, `onOpen`
 * also offers a hand-off to the full reader.
 */
function EmailCard({
  email,
  onOpen,
}: {
  email: AgentEmail
  onOpen?: (email: AgentEmail) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [body, setBody] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")

  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next && body === null && status !== "loading") {
      setStatus("loading")
      emailsApi
        .getEmail(email.id)
        .then((full) => {
          setBody(full.bodyText || full.snippet || "")
          setStatus("idle")
        })
        .catch(() => setStatus("error"))
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden border-b border-line transition-colors last:border-b-0",
        email.unread ? "bg-surface" : "bg-inset/50"
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className="flex min-h-12 w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-hover"
      >
        <Avatar email={email} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-[13px]",
                email.unread
                  ? "font-semibold text-foreground"
                  : "font-medium text-foreground/80"
              )}
            >
              {email.from}
            </span>
            {email.important && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-amber-500"
                title="Important"
                aria-label="Important"
              />
            )}
            {email.starred && (
              <StarIcon
                className="size-3 shrink-0 fill-amber-400 text-amber-400"
                aria-label="Starred"
              />
            )}
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatEmailDate(email.date)}
            </span>
          </div>
          <div
            className={cn(
              "truncate text-[13px]",
              email.unread ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {email.subject}
          </div>
        </div>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground/50 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-line bg-inset px-3 py-2.5">
          {status === "loading" && (
            <div className="flex items-center gap-2">
              <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
              <span className="loop-shimmer text-[12px] font-medium">
                Loading message…
              </span>
            </div>
          )}
          {status === "error" && (
            <p className="text-[12px] text-destructive">
              Couldn&apos;t load this email.
            </p>
          )}
          {status === "idle" && body !== null && (
            <>
              <div className="max-h-80 overflow-auto">
                <EmailBody body={body} />
              </div>
              {onOpen && (
                <MessageActions email={email} onOpen={onOpen} className="mt-3" />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** A single placeholder row shown while the inbox is loading. */
function SkeletonCard() {
  return (
    <div className="flex items-start gap-3 border-b border-line bg-surface px-3 py-2.5 last:border-b-0">
      <span className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="h-3 w-28 animate-pulse rounded bg-muted" />
          <span className="h-2.5 w-10 animate-pulse rounded bg-muted" />
        </div>
        <span className="block h-3 w-3/4 animate-pulse rounded bg-muted" />
        <span className="block h-2.5 w-full animate-pulse rounded bg-muted/70" />
      </div>
    </div>
  )
}

/** Loading placeholder for the `listEmails` tool while it fetches the inbox. */
export function EmailResultsSkeleton({ label }: { label?: string }) {
  return (
    <AgentCard
      title="Inbox"
      icon={<MailIcon className="size-3.5" />}
      bodyClassName="p-0"
      meta={
        <LoadingState
          label={label ?? "Fetching…"}
          variant="dots"
          className="gap-1.5 py-0 [&>span:nth-child(2)]:text-[11px]"
        />
      }
    >
      <div className="flex flex-col">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </AgentCard>
  )
}

/**
 * Generative-UI block rendered when the `listEmails` tool returns. Shows the
 * matched inbox messages as cards linking out to Gmail.
 */
export function EmailResults({
  emails,
  count,
  connected = true,
  unreadOnly = false,
  query,
  error,
  onOpenEmail,
}: {
  emails: AgentEmail[]
  count: number
  connected?: boolean
  unreadOnly?: boolean
  query?: string
  error?: string
  onOpenEmail?: (email: AgentEmail) => void
}) {
  if (!connected && emails.length === 0) return <ConnectGoogle />

  const unreadCount = emails.filter((e) => e.unread).length
  const label = unreadOnly ? "unread email" : "email"

  return (
    <AgentCard
      title={query ? `Mail for “${query}”` : unreadOnly ? "Unread mail" : "Inbox"}
      icon={<MailIcon className="size-3.5" />}
      meta={error ? "Failed" : `${count} ${label}${count === 1 ? "" : "s"}`}
      tone={error ? "danger" : "default"}
      bodyClassName="p-0"
    >
      {error && (
        <p className="px-3 py-3 text-[12px] text-destructive">
          Couldn&apos;t load emails: {error}
        </p>
      )}
      {!error && !unreadOnly && unreadCount > 0 && (
        <div className="border-b border-line bg-inset px-3 py-1.5 text-[11px] font-medium text-accent-ink">
          {unreadCount} unread
        </div>
      )}
      {!error && emails.length > 0 && (
        <div className="flex flex-col">
          {emails.map((email) => (
            <EmailCard key={email.id} email={email} onOpen={onOpenEmail} />
          ))}
        </div>
      )}

      {!error && emails.length === 0 && (
        <p className="px-3 py-3 text-[12px] text-muted-foreground/70">
          {unreadOnly ? "No unread emails." : "Nothing matched."}
        </p>
      )}
    </AgentCard>
  )
}

/** Matches the leading line of a quoted reply chain in a plain-text body. */
const QUOTE_HEADER =
  /^\s*(On .+wrote:|-{2,}\s*Original Message\s*-{2,}|_{5,}|From:\s.+)\s*$/i

/**
 * Split a plain-text email body into the freshly-written portion and the
 * trailing quoted reply chain, so the quote can be collapsed by default.
 */
function splitQuoted(body: string): { main: string; quoted: string } {
  const lines = body.split("\n")
  let cutoff = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (QUOTE_HEADER.test(line) || line.trimStart().startsWith(">")) {
      cutoff = i
      break
    }
  }
  // Keep the whole body as the main text when there's no lead-in before a quote.
  if (cutoff <= 0) return { main: body, quoted: "" }
  return {
    main: lines.slice(0, cutoff).join("\n").trimEnd(),
    quoted: lines.slice(cutoff).join("\n").trim(),
  }
}

/**
 * Renders a plain-text email body with the quoted reply chain hidden behind a
 * toggle, keeping the fresh content front-and-center.
 */
function EmailBody({ body }: { body: string }) {
  // Only ever show the freshly-written portion in chat; the quoted reply chain
  // is noise here (the full message lives in the reader).
  const main = useMemo(() => {
    const { main } = splitQuoted(body)
    return main || body
  }, [body])

  return (
    <p className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
      {main}
    </p>
  )
}

/**
 * Generative-UI block for the `readEmail` tool. Compact by default (sender,
 * subject, preview); click to expand the full message inline. On the mail page,
 * `onOpenEmail` offers a hand-off to the full reader.
 */
export function EmailDetailCard({
  email,
  error,
  connected = true,
  onOpenEmail,
}: {
  email?: AgentThreadMessage
  error?: string
  connected?: boolean
  onOpenEmail?: (email: AgentEmail) => void
}) {
  const [open, setOpen] = useState(false)

  if (!connected) return <ConnectGoogle />
  if (error) {
    return (
      <AgentNotice
        icon={<MailOpenIcon className="size-3.5" />}
        title="Couldn’t read that email"
        description={error}
        tone="danger"
      />
    )
  }
  if (!email) return null

  return (
    <div className="my-2 overflow-hidden rounded-card bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-hover"
      >
        <Avatar email={email} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {email.from}
            </span>
            {email.starred && (
              <StarIcon
                className="size-3 shrink-0 fill-amber-400 text-amber-400"
                aria-label="Starred"
              />
            )}
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatFullDate(email.date)}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[13px] font-medium text-foreground">
            {email.subject}
          </div>
          {!open && (
            <div className="mt-0.5 truncate text-[12px] text-muted-foreground/70">
              {email.snippet}
            </div>
          )}
          <EmailBadges email={email} />
        </div>
        <ChevronDownIcon
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="border-t border-line bg-inset px-3.5 py-3">
          <div className="max-h-96 overflow-auto">
            <EmailBody body={email.body} />
          </div>
          <MessageActions email={email} onOpen={onOpenEmail} className="mt-3" />
        </div>
      )}
    </div>
  )
}

/** One expandable message within the thread view. */
function ThreadMessage({
  message,
  defaultOpen,
  onOpen,
}: {
  message: AgentThreadMessage
  defaultOpen: boolean
  onOpen?: (email: AgentEmail) => void
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="overflow-hidden border-b border-line bg-surface last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-hover"
      >
        <Avatar email={message} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-foreground">
              {message.from}
            </span>
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatEmailDate(message.date)}
            </span>
          </div>
          {!open && (
            <div className="mt-0.5 truncate text-[12px] text-muted-foreground/70">
              {message.snippet}
            </div>
          )}
        </div>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="border-t border-line bg-inset px-3 py-2.5">
          <EmailBody body={message.body} />
          <MessageActions email={message} onOpen={onOpen} className="mt-3" />
        </div>
      )}
    </div>
  )
}

/**
 * Generative-UI block for the `readThread` tool: a stacked conversation where
 * each message can be expanded, with the latest open by default.
 */
export function EmailThread({
  subject,
  messages,
  count,
  error,
  connected = true,
  onOpenEmail,
}: {
  subject?: string
  messages: AgentThreadMessage[]
  count: number
  error?: string
  connected?: boolean
  onOpenEmail?: (email: AgentEmail) => void
}) {
  const participants = useMemo(() => {
    const seen = new Set<string>()
    const unique: AgentThreadMessage[] = []
    for (const message of messages) {
      const key = message.fromEmail || message.from
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(message)
    }
    return unique.slice(0, 4)
  }, [messages])

  if (!connected && messages.length === 0) return <ConnectGoogle />
  if (error) {
    return (
      <AgentNotice
        icon={<MessagesSquareIcon className="size-3.5" />}
        title="Couldn’t read that thread"
        description={error}
        tone="danger"
      />
    )
  }
  if (messages.length === 0) return null

  return (
    <AgentCard
      title={subject ? `“${subject}”` : "Email thread"}
      icon={<MessagesSquareIcon className="size-3.5" />}
      meta={`${count} message${count === 1 ? "" : "s"}`}
      bodyClassName="p-0"
      footer={
        participants.length > 1 ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-3">Participants</span>
            <span className="flex shrink-0 -space-x-1.5">
              {participants.map((participant) => (
                <span
                  key={participant.fromEmail || participant.from}
                  className={cn(
                    "grid size-5 place-items-center rounded-full text-[9px] font-semibold ring-2 ring-[var(--inset)]",
                    avatarTint(participant.fromEmail || participant.from)
                  )}
                  title={participant.from}
                  aria-hidden
                >
                  {initials(participant.from)}
                </span>
              ))}
            </span>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col">
        {messages.map((message) => (
          <ThreadMessage
            key={message.id}
            message={message}
            defaultOpen={false}
            onOpen={onOpenEmail}
          />
        ))}
      </div>
    </AgentCard>
  )
}

/**
 * Generative-UI block for the `draftReply` tool: an editable, email-styled
 * reply the user can refine and copy. Loop does not send mail.
 */
export function EmailDraftCard({ draft }: { draft: AgentDraft }) {
  const [to, setTo] = useState(draft.to)
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState<"body" | "draft" | null>(null)
  const copiedTimerRef = useRef<number | undefined>(undefined)

  useEffect(
    () => () => window.clearTimeout(copiedTimerRef.current),
    []
  )

  const edited = to !== draft.to || subject !== draft.subject || body !== draft.body
  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0

  const reset = () => {
    setTo(draft.to)
    setSubject(draft.subject)
    setBody(draft.body)
  }

  const copy = async (target: "body" | "draft") => {
    if (!navigator.clipboard) return
    const text =
      target === "body"
        ? body
        : [`To: ${to}`, `Subject: ${subject}`, "", body].join("\n")
    try {
      await navigator.clipboard.writeText(text)
      window.clearTimeout(copiedTimerRef.current)
      setCopied(target)
      copiedTimerRef.current = window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  return (
    <AgentCard
      title="Draft reply"
      icon={<PenLineIcon className="size-3.5" />}
      meta={
        <span className="inline-flex items-center gap-1.5">
          <span>Not sent</span>
          {edited && (
            <>
              <span className="size-1 rounded-full bg-orange" />
              <span className="text-orange">Edited</span>
            </>
          )}
        </span>
      }
      bodyClassName="p-0"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              {edited && (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex h-7 items-center gap-1.5 rounded-control px-2 text-[12px] font-medium text-ink-3 transition-[background-color,color,transform] hover:bg-hover hover:text-ink active:scale-[0.96]"
                >
                  <RotateCcwIcon className="size-3.5" />
                  Reset
                </button>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void copy("draft")}
                  className="inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium text-ink-2 transition-[background-color,color,transform] hover:bg-hover hover:text-ink active:scale-[0.96]"
                >
                  {copied === "draft" ? (
                    <CheckIcon className="size-3.5 text-green" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                  {copied === "draft" ? "Copied" : "Copy email"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex h-7 items-center rounded-control bg-ink px-3 text-[12px] font-medium text-canvas transition-[opacity,transform] hover:opacity-90 active:scale-[0.96]"
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium text-ink-2 transition-[background-color,color,transform] hover:bg-hover hover:text-ink active:scale-[0.96]"
              >
                <PenLineIcon className="size-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => void copy("body")}
                className="inline-flex h-7 items-center gap-1.5 rounded-control bg-ink px-2.5 text-[12px] font-medium text-canvas transition-[opacity,transform] hover:opacity-90 active:scale-[0.96]"
              >
                {copied === "body" ? (
                  <CheckIcon className="size-3.5 text-green" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
                {copied === "body" ? "Copied" : "Copy reply"}
              </button>
            </div>
          )}
        </div>
      }
    >
      {editing ? (
        <>
          <div className="px-3.5">
            <label className="flex min-h-9 items-center gap-2 border-b border-line text-[13px] focus-within:text-ink">
              <span className="w-14 shrink-0 text-ink-3">To</span>
              <input
                value={to}
                onChange={(event) => setTo(event.target.value)}
                aria-label="Draft recipient"
                placeholder="Recipient"
                className="min-w-0 flex-1 bg-transparent py-2 text-ink outline-none placeholder:text-ink-3"
              />
            </label>
            <label className="flex min-h-9 items-center gap-2 text-[13px] focus-within:text-ink">
              <span className="w-14 shrink-0 text-ink-3">Subject</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                aria-label="Draft subject"
                placeholder="Subject"
                className="min-w-0 flex-1 bg-transparent py-2 font-medium text-ink outline-none placeholder:text-ink-3"
              />
            </label>
          </div>
          <div className="border-t border-line bg-inset/60 transition-colors focus-within:bg-surface">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              aria-label="Draft body"
              rows={7}
              placeholder="Write a reply…"
              className="min-h-36 w-full resize-y bg-transparent px-3.5 py-3 font-sans text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
            />
            <div className="flex items-center justify-end px-3.5 pb-2 text-[10.5px] tabular-nums text-ink-3">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="px-3.5">
            <div className="flex gap-2 border-b border-line py-2 text-[13px]">
              <span className="w-14 shrink-0 text-ink-3">To</span>
              <span className="min-w-0 flex-1 truncate text-ink">
                {to || "—"}
              </span>
            </div>
            <div className="flex gap-2 py-2 text-[13px]">
              <span className="w-14 shrink-0 text-ink-3">Subject</span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">
                {subject || "(no subject)"}
              </span>
            </div>
          </div>
          <div className="border-t border-line px-3.5 py-3">
            <p className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink/90">
              {body || "No reply text yet."}
            </p>
          </div>
        </>
      )}
    </AgentCard>
  )
}
