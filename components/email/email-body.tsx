'use client'

import { DownloadIcon, FileIcon, ImageIcon, PaperclipIcon } from 'lucide-react'
import { Fragment, useCallback } from 'react'

import { attachmentUrl, inlineImageUrl, type Email } from '@/lib/api/emails'
import { cn } from '@/lib/utils'

import { APP_ORIGIN, RenderedEmailHtml } from './html-frame'
import { formatBytes } from './utils'

/** Rewrite `cid:` image refs to absolute inline-attachment URLs for this message. */
function rewriteCidImages(html: string, email: Email): string {
  const byCid = new Map<string, string>()
  for (const att of email.attachments ?? []) {
    if (att.contentId) {
      byCid.set(att.contentId, `${APP_ORIGIN}${inlineImageUrl(email.id, att)}`)
    }
  }
  if (byCid.size === 0) return html
  return html.replace(/src=("|')cid:([^"']+)\1/gi, (match, quote: string, cid: string) => {
    const url = byCid.get(cid) ?? byCid.get(cid.trim())
    return url ? `src=${quote}${url}${quote}` : match
  })
}

/**
 * The HTML part of a message. Embedded `cid:` images resolve to this message's
 * inline attachment URLs before anything is sanitized or rendered.
 */
function EmailHtmlBody({ email }: { email: Email }) {
  const preprocess = useCallback(
    (html: string) => rewriteCidImages(html, email),
    [email]
  )
  return <RenderedEmailHtml html={email.bodyHtml} preprocess={preprocess} />
}


/** Angle-bracketed bare URLs (`<https://…>`) render ugly; unwrap them. */
function cleanPlainText(text: string): string {
  return text
    .replace(/<((?:https?:\/\/)[^>\s]+)>/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const URL_SPLIT_RE = /(https?:\/\/[^\s<>()]+)/g
const IS_URL_RE = /^https?:\/\/[^\s<>()]+$/

/** Render plain text with clickable links. */
function PlainTextBody({ text }: { text: string }) {
  const cleaned = cleanPlainText(text)
  const parts = cleaned.split(URL_SPLIT_RE)

  return (
    <div className="max-w-2xl text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
      {parts.map((part, i) =>
        IS_URL_RE.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 break-all"
          >
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </div>
  )
}

function AttachmentChip({
  messageId,
  att,
}: {
  messageId: string
  att: Email['attachments'][number]
}) {
  const Icon = att.mimeType.startsWith('image/') ? ImageIcon : FileIcon
  return (
    <a
      href={attachmentUrl(messageId, att)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2 text-left transition-colors hover:bg-muted/60"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block max-w-[12rem] truncate text-[13px] font-medium text-foreground">
          {att.filename}
        </span>
        {att.size > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {formatBytes(att.size)}
          </span>
        )}
      </span>
      <DownloadIcon className="ml-1 size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
    </a>
  )
}

function BodySkeleton() {
  return (
    <div className="animate-pulse space-y-2.5" aria-hidden>
      {['w-11/12', 'w-full', 'w-4/5', 'w-full', 'w-2/3', 'w-9/12', 'w-1/2'].map(
        (w, i) => (
          <div key={i} className={cn('h-3 rounded bg-muted', w)} />
        )
      )}
    </div>
  )
}

/**
 * The message body + attachments. Prefers the HTML part (rendered clean and
 * sandboxed) over the raw plain-text part, which is often cluttered with
 * tracking URLs.
 */
export function EmailBody({
  email,
  isLoading,
  error,
}: {
  email: Email
  isLoading: boolean
  error: string | null
}) {
  const hasBody = Boolean(email.bodyHtml || email.bodyText)
  const files = (email.attachments ?? []).filter((a) => !a.inline)

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (isLoading && !hasBody) {
    return <BodySkeleton />
  }

  return (
    <div className="flex flex-col gap-4">
      {email.bodyHtml ? (
        <EmailHtmlBody email={email} />
      ) : email.bodyText ? (
        <PlainTextBody text={email.bodyText} />
      ) : (
        <p className="text-sm text-muted-foreground">{email.snippet}</p>
      )}

      {files.length > 0 && (
        <div className="border-t border-border/60 pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            <PaperclipIcon className="size-3.5" />
            {files.length} attachment{files.length === 1 ? '' : 's'}
          </div>
          <div className="flex flex-wrap gap-2">
            {files.map((att) => (
              <AttachmentChip
                key={att.attachmentId}
                messageId={email.id}
                att={att}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
