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
  StarIcon,
} from "lucide-react"
import { useMemo, useState } from "react"

import { ConnectGoogle } from "@/components/cal/agent/connect-google"
import { avatarTint, formatFullDate, initials } from "@/components/email/utils"
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
        "overflow-hidden rounded-xl border transition-colors",
        email.unread ? "border-border/70 bg-background" : "border-border/60 bg-muted/20"
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/40"
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
        <div className="border-t border-border/60 px-3 py-2.5">
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
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5">
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
    <div className="my-2 flex flex-col gap-2">
      <div className="flex items-center gap-2.5" aria-live="polite">
        <span className="relative grid size-6 shrink-0 place-items-center rounded-lg bg-muted text-foreground/80 ring-1 ring-inset ring-border/60">
          <span className="loop-halo absolute inset-0 rounded-lg bg-foreground/10" />
          <MailIcon className="relative size-3.5" />
        </span>
        <span className="loop-shimmer text-[13px] font-medium">
          {label ?? "Fetching your inbox…"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
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
    <div className="my-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <MailIcon className="size-3.5" />
        {error ? (
          <span className="text-destructive">Couldn&apos;t load emails: {error}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span>
              {count} {label}
              {count === 1 ? "" : "s"}
              {query ? (
                <>
                  {" "}for{" "}
                  <span className="font-medium text-foreground">“{query}”</span>
                </>
              ) : null}
            </span>
            {!unreadOnly && unreadCount > 0 && (
              <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                {unreadCount} unread
              </span>
            )}
          </span>
        )}
      </div>

      {!error && emails.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {emails.map((email) => (
            <EmailCard key={email.id} email={email} onOpen={onOpenEmail} />
          ))}
        </div>
      )}

      {!error && emails.length === 0 && (
        <p className="text-[12px] text-muted-foreground/70">
          {unreadOnly ? "No unread emails." : "Nothing matched."}
        </p>
      )}
    </div>
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
      <p className="my-2 text-[12px] text-destructive">
        Couldn&apos;t read that email: {error}
      </p>
    )
  }
  if (!email) return null

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/70 bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted/40"
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
        <div className="border-t border-border/60 px-3.5 py-3">
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
    <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
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
        <div className="border-t border-border/60 px-3 py-2.5">
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
      <p className="my-2 text-[12px] text-destructive">
        Couldn&apos;t read that thread: {error}
      </p>
    )
  }
  if (messages.length === 0) return null

  return (
    <div className="my-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <MessagesSquareIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">
          {count} message{count === 1 ? "" : "s"}
          {subject ? (
            <>
              {" "}in{" "}
              <span className="font-medium text-foreground">“{subject}”</span>
            </>
          ) : null}
        </span>
        {participants.length > 1 && (
          <span className="ml-auto flex shrink-0 -space-x-1.5">
            {participants.map((p) => (
              <span
                key={p.fromEmail || p.from}
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[9px] font-semibold ring-2 ring-background",
                  avatarTint(p.fromEmail || p.from)
                )}
                title={p.from}
                aria-hidden
              >
                {initials(p.from)}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {messages.map((message) => (
          <ThreadMessage
            key={message.id}
            message={message}
            defaultOpen={false}
            onOpen={onOpenEmail}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Generative-UI block for the `draftReply` tool: a read-only, email-styled
 * preview of a reply the assistant composed, with a copy action. (loop doesn't
 * send mail — this is a starting point the user can copy into Gmail.)
 */
export function EmailDraftCard({ draft }: { draft: AgentDraft }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard?.writeText(draft.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/70 bg-background">
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/30 px-3.5 py-2 text-[12px] font-medium text-muted-foreground">
        <PenLineIcon className="size-3.5" />
        Draft reply
      </div>
      <div className="px-3.5">
        <div className="flex gap-2 border-b border-border/50 py-2 text-[13px]">
          <span className="w-14 shrink-0 text-muted-foreground">To</span>
          <span className="min-w-0 flex-1 truncate text-foreground">
            {draft.to || "—"}
          </span>
        </div>
        <div className="flex gap-2 py-2 text-[13px]">
          <span className="w-14 shrink-0 text-muted-foreground">Subject</span>
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            {draft.subject || "(no subject)"}
          </span>
        </div>
      </div>
      <div className="border-t border-border/60 px-3.5 py-3">
        <p className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
          {draft.body}
        </p>
      </div>
      <div className="flex items-center justify-end border-t border-border/60 px-3.5 py-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          {copied ? (
            <CheckIcon className="size-3.5 text-emerald-500" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy reply"}
        </button>
      </div>
    </div>
  )
}
