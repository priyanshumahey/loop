'use client'

import { MailIcon, RefreshCwIcon, SearchIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import type { Email } from '@/lib/api/emails'
import type { AgentEmail } from '@/lib/cal-agent/tools'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ContextEmail } from '@/components/cal/cal-agent'
import { useEmails } from '@/hooks/use-emails'
import { cn } from '@/lib/utils'

import { EmailDetail } from './email-detail'
import { EmailList } from './email-list'
import { MailCopilotPanel } from './mail-copilot-panel'
import { MailSidebar } from './mail-sidebar'
import { folderQuery, parseAddress, type MailFolder } from './utils'

const FOLDER_LABEL: Record<MailFolder, string> = {
  all: 'All mail',
  unread: 'Unread',
  starred: 'Starred',
  important: 'Important',
  primary: 'Primary',
  social: 'Social',
  promotions: 'Promotions',
  updates: 'Updates',
  forums: 'Forums',
}

const CATEGORY_LABEL: Record<string, string> = {
  primary: 'CATEGORY_PERSONAL',
  social: 'CATEGORY_SOCIAL',
  promotions: 'CATEGORY_PROMOTIONS',
  updates: 'CATEGORY_UPDATES',
  forums: 'CATEGORY_FORUMS',
}

/** Seed a reader-ready Email from a lightweight agent email (body fetched by id). */
function agentEmailToSummary(a: AgentEmail): Email {
  const labels: string[] = []
  if (a.unread) labels.push('UNREAD')
  if (a.important) labels.push('IMPORTANT')
  if (a.starred) labels.push('STARRED')
  if (a.category && CATEGORY_LABEL[a.category]) labels.push(CATEGORY_LABEL[a.category])
  return {
    id: a.id,
    threadId: a.threadId,
    from: a.from,
    to: '',
    cc: '',
    subject: a.subject,
    date: a.date,
    snippet: a.snippet,
    bodyText: '',
    bodyHtml: '',
    attachments: [],
    labels,
    unread: a.unread,
  }
}

/** Build the lightweight, serializable context email the copilot attaches. */
function toContextEmail(email: Email): ContextEmail {
  const parsed = new Date(email.date)
  return {
    id: email.id,
    threadId: email.threadId,
    from: parseAddress(email.from).name,
    subject: email.subject,
    date: Number.isNaN(parsed.getTime()) ? email.date : parsed.toISOString(),
    snippet: email.snippet,
  }
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-2" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-2 py-2.5">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="h-3 w-28 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-10 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Full inbox experience: sidebar · list + reader · assistant, matching /cal. */
export function MailView() {
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState<MailFolder>('all')
  const [selected, setSelected] = useState<Email | null>(null)
  const [contextEmails, setContextEmails] = useState<ContextEmail[]>([])

  const query = useMemo(
    () => [folderQuery(folder), search.trim()].filter(Boolean).join(' '),
    [folder, search]
  )

  // A free-text search should look across all mail (archived, sent, every
  // label), not just the inbox, so messages that left the inbox are findable.
  const allMail = search.trim().length > 0

  const {
    emails,
    isLoading,
    isRefreshing,
    isConnected,
    isLoadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
  } = useEmails({ query: query || undefined, allMail })

  const unreadCount = useMemo(
    () => emails.filter((e) => e.unread).length,
    [emails]
  )

  const openAgentEmail = (a: AgentEmail) => setSelected(agentEmailToSummary(a))

  const attachToCopilot = useCallback((email: Email) => {
    const ctx = toContextEmail(email)
    setContextEmails((prev) =>
      prev.some((e) => e.id === ctx.id) ? prev : [...prev, ctx]
    )
  }, [])

  const removeContextEmail = useCallback(
    (id: string) => setContextEmails((prev) => prev.filter((e) => e.id !== id)),
    []
  )

  const clearContextEmails = useCallback(() => setContextEmails([]), [])

  if (!isConnected && !isLoading) {
    return (
      <div className="grid h-svh place-items-center bg-muted/40 p-8 text-center">
        <div className="max-w-sm space-y-3">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-foreground text-background">
            <MailIcon className="size-6" />
          </span>
          <h1 className="font-heading text-lg font-medium">Connect Gmail</h1>
          <p className="text-sm text-muted-foreground">
            Link your Google account to read your inbox right inside loop.
          </p>
          <a href="/auth/google" className={buttonVariants()}>
            Connect Google
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-svh w-full overflow-hidden bg-muted/40">
      <MailSidebar
        folder={folder}
        onFolderChange={setFolder}
        unreadCount={unreadCount}
      />

      <main className="flex min-w-0 flex-1 flex-col p-2 pl-0">
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
          {/* List column */}
          <div
            className={cn(
              'w-full shrink-0 flex-col border-r border-border/60 md:flex md:max-w-xs',
              selected ? 'hidden md:flex' : 'flex'
            )}
          >
            <header className="flex flex-col gap-2.5 border-b border-border/60 px-3 py-3">
              <div className="flex items-center gap-2 px-1">
                <h1 className="font-heading text-base font-medium">
                  {FOLDER_LABEL[folder]}
                </h1>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void refresh()}
                  disabled={isRefreshing}
                  aria-label="Refresh"
                  className="ml-auto"
                >
                  <RefreshCwIcon className={cn(isRefreshing && 'animate-spin')} />
                </Button>
              </div>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search mail…"
                  className="h-8 pl-8"
                  type="search"
                />
              </div>
            </header>

            {error && (
              <p className="border-b border-border/60 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              {isLoading ? (
                <ListSkeleton />
              ) : (
                <>
                  <EmailList
                    emails={emails}
                    selectedId={selected?.id ?? null}
                    onSelect={setSelected}
                  />
                  {hasMore && (
                    <div className="p-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => void loadMore()}
                        disabled={isLoadingMore}
                      >
                        {isLoadingMore ? 'Loading…' : 'Load older messages'}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Reader column */}
          <div className={cn('min-w-0 flex-1', selected ? 'block' : 'hidden md:block')}>
            {selected ? (
              <EmailDetail
                key={selected.id}
                summary={selected}
                onBack={() => setSelected(null)}
                onAskCopilot={attachToCopilot}
              />
            ) : (
              <div className="grid h-full place-items-center p-8 text-center">
                <div className="space-y-2 text-muted-foreground">
                  <MailIcon className="mx-auto size-8 opacity-40" />
                  <p className="text-sm">Select a message to read it here.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <MailCopilotPanel
        onOpenEmail={openAgentEmail}
        contextEmails={contextEmails}
        onRemoveContextEmail={removeContextEmail}
        onClearContextEmails={clearContextEmails}
      />
    </div>
  )
}
