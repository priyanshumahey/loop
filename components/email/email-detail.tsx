'use client'

import { ArrowLeftIcon, ChevronDownIcon, SparklesIcon, StarIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import * as emailsApi from '@/lib/api/emails'
import type { Email } from '@/lib/api/emails'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { EmailBody } from './email-body'
import {
  CATEGORY_STYLE,
  avatarTint,
  deriveFlags,
  formatEmailDate,
  formatFullDate,
  initials,
  parseAddress,
  parseAddressList,
} from './utils'

interface EmailDetailProps {
  /** The list summary of the selected thread (used for instant header render). */
  summary: Email
  /** Shown on small screens to return to the list. */
  onBack?: () => void
  /** Attach this email as context for the copilot's next message. */
  onAskCopilot?: (email: Email) => void
}

/** Join a recipient list into a short display string ("Alice, Bob, +2"). */
function recipientSummary(list: { name: string }[]): string {
  if (list.length === 0) return ''
  const names = list.map((r) => r.name)
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')}, +${names.length - 3}`
}

/** A single message within the conversation, collapsible when it isn't newest. */
function MessageCard({
  email,
  defaultOpen,
  isLoading,
}: {
  email: Email
  defaultOpen: boolean
  isLoading: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const from = parseAddress(email.from)
  const toList = parseAddressList(email.to)
  const ccList = parseAddressList(email.cc)

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold',
            avatarTint(email.from || email.id)
          )}
          aria-hidden
        >
          {initials(from.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {from.name}
            </span>
            {email.unread && (
              <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            )}
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {open ? formatFullDate(email.date) : formatEmailDate(email.date)}
            </span>
            <ChevronDownIcon
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180'
              )}
            />
          </div>
          {open ? (
            <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
              {from.email !== from.name && <p className="truncate">{from.email}</p>}
              {toList.length > 0 && (
                <p className="truncate">to {recipientSummary(toList)}</p>
              )}
              {ccList.length > 0 && (
                <p className="truncate">cc {recipientSummary(ccList)}</p>
              )}
            </div>
          ) : (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
              {email.snippet}
            </p>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60 px-4 py-4">
          <EmailBody
            email={email}
            isLoading={isLoading && !email.bodyHtml && !email.bodyText}
            error={null}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Renders a whole conversation thread. Fetches every message in the thread on
 * demand; the newest message is expanded, older ones are collapsed. Each
 * message's body (clean HTML, plain-text fallback, attachments) is handled by
 * EmailBody.
 */
export function EmailDetail({ summary, onBack, onAskCopilot }: EmailDetailProps) {
  const [messages, setMessages] = useState<Email[]>([summary])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const request = summary.threadId
      ? emailsApi.getThread(summary.threadId)
      : emailsApi.getEmail(summary.id).then((m) => [m])

    request
      .then((msgs) => {
        if (!cancelled && msgs.length > 0) setMessages(msgs)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load email')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [summary.threadId, summary.id])

  // Thread-level header: original subject + triage flags from the newest message.
  const newest = messages[messages.length - 1] ?? summary
  const subject = messages[0]?.subject || summary.subject
  const { important, starred, category } = deriveFlags(newest)
  const cat = category && category !== 'primary' ? CATEGORY_STYLE[category] : null

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-5 py-4 sm:px-6">
        <div className="mb-1.5 flex items-center gap-2">
          {onBack && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onBack}
              className="-ml-1 md:hidden"
              aria-label="Back to inbox"
            >
              <ArrowLeftIcon />
            </Button>
          )}
          <h1 className="min-w-0 flex-1 font-heading text-xl leading-tight font-semibold tracking-tight text-foreground">
            {subject || '(no subject)'}
          </h1>
          {onAskCopilot && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAskCopilot(newest)}
              className="shrink-0 gap-1.5"
              title="Ask the assistant about this email"
            >
              <SparklesIcon className="size-3.5" />
              Ask copilot
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
          {messages.length > 1 && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
              {messages.length} messages
            </span>
          )}
          {starred && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-500">
              <StarIcon className="size-3 fill-amber-400 text-amber-400" />
              Starred
            </span>
          )}
          {important && (
            <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-500">
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
              Important
            </span>
          )}
          {cat && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
              {cat.label}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5 sm:px-6">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message, i) => (
              <MessageCard
                key={message.id || i}
                email={message}
                defaultOpen={i === messages.length - 1}
                isLoading={isLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
