'use client'

import { PaperclipIcon, StarIcon } from 'lucide-react'
import { Fragment, useMemo } from 'react'

import type { Email } from '@/lib/api/emails'
import { cn } from '@/lib/utils'

import {
  CATEGORY_STYLE,
  avatarTint,
  dateBucket,
  deriveFlags,
  formatEmailDate,
  initials,
  senderLabel,
} from './utils'

interface EmailListProps {
  emails: Email[]
  selectedId: string | null
  onSelect: (email: Email) => void
}

function EmailRow({
  email,
  isSelected,
  onSelect,
}: {
  email: Email
  isSelected: boolean
  onSelect: (email: Email) => void
}) {
  const name = senderLabel(email)
  const { important, starred, category } = deriveFlags(email)
  const cat = category && category !== 'primary' ? CATEGORY_STYLE[category] : null

  return (
    <button
      type="button"
      onClick={() => onSelect(email)}
      className={cn(
        'group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors',
        isSelected ? 'bg-muted' : 'hover:bg-muted/50'
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
          avatarTint(email.from || email.id)
        )}
        aria-hidden
      >
        {initials(name)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[13px]',
              email.unread ? 'font-semibold text-foreground' : 'text-foreground/80'
            )}
          >
            {name}
          </span>
          {email.messageCount > 1 && (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
              {email.messageCount}
            </span>
          )}
          {starred && (
            <StarIcon className="size-3 shrink-0 fill-amber-400 text-amber-400" />
          )}
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {formatEmailDate(email.date)}
          </span>
        </div>

        <div
          className={cn(
            'mt-0.5 flex items-center gap-1.5',
            email.unread ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {email.unread && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-foreground"
              aria-hidden
            />
          )}
          <span
            className={cn('truncate text-[13px]', email.unread ? 'font-medium' : '')}
          >
            {email.subject || '(no subject)'}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground/80">
            {email.snippet}
          </span>
          {email.hasAttachments && (
            <PaperclipIcon
              className="size-3 shrink-0 text-muted-foreground/70"
              aria-label="Has attachment"
            />
          )}
          {important && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-amber-500"
              title="Important"
              aria-label="Important"
            />
          )}
          {cat && (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {cat.label}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

/** The scrollable inbox list, grouped by recency with sender avatars. */
export function EmailList({ emails, selectedId, onSelect }: EmailListProps) {
  // Precompute each row's optional section header so we never mutate during render.
  const rows = useMemo(
    () =>
      emails.map((email, i) => {
        const bucket = dateBucket(email.date)
        const prev = i > 0 ? dateBucket(emails[i - 1].date) : null
        return { email, header: bucket !== prev ? bucket : null }
      }),
    [emails]
  )

  if (emails.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
        No messages here.
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {rows.map(({ email, header }) => (
        <Fragment key={email.id}>
          {header && (
            <div className="sticky top-0 z-10 bg-background/95 px-4 pt-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase backdrop-blur">
              {header}
            </div>
          )}
          <EmailRow
            email={email}
            isSelected={email.id === selectedId}
            onSelect={onSelect}
          />
        </Fragment>
      ))}
    </div>
  )
}
