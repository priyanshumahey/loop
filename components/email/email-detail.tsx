'use client'

import { ArrowLeftIcon, SparklesIcon, StarIcon } from 'lucide-react'
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
  formatFullDate,
  initials,
  parseAddress,
} from './utils'

interface EmailDetailProps {
  /** The list summary of the selected email (used for instant header render). */
  summary: Email
  /** Shown on small screens to return to the list. */
  onBack?: () => void
  /** Attach this email as context for the copilot's next message. */
  onAskCopilot?: (email: Email) => void
}

/**
 * Renders a single email in full. Fetches the full body on demand; the body
 * itself (clean HTML, plain-text fallback, and attachments) is handled by
 * EmailBody.
 */
export function EmailDetail({ summary, onBack, onAskCopilot }: EmailDetailProps) {
  const [email, setEmail] = useState<Email>(summary)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    emailsApi
      .getEmail(summary.id)
      .then((full) => {
        if (!cancelled) setEmail(full)
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
  }, [summary.id])

  const from = parseAddress(email.from)
  const { important, starred, category } = deriveFlags(email)
  const cat = category && category !== 'primary' ? CATEGORY_STYLE[category] : null

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-5 py-4 sm:px-6">
        <div className="mb-3.5 flex items-center gap-2">
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
            {email.subject || '(no subject)'}
          </h1>
          {onAskCopilot && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAskCopilot(email)}
              className="shrink-0 gap-1.5"
              title="Ask the assistant about this email"
            >
              <SparklesIcon className="size-3.5" />
              Ask copilot
            </Button>
          )}
        </div>

        <div className="flex items-start gap-3">
          <span
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold',
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
              {starred && (
                <StarIcon className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
              )}
              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatFullDate(email.date)}
              </span>
            </div>
            {from.email !== from.name && (
              <p className="truncate text-xs text-muted-foreground">{from.email}</p>
            )}
            {email.to && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                to {parseAddress(email.to).name}
              </p>
            )}
            {(important || cat) && (
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                {important && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-500">
                    <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
                    Important
                  </span>
                )}
                {cat && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {cat.label}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5 sm:px-6">
        <EmailBody email={email} isLoading={isLoading} error={error} />
      </div>
    </div>
  )
}
