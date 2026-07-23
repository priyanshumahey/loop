import type { Email } from '@/lib/api/emails'

/**
 * Split an RFC 5322 `From`/`To` header value into a display name and address.
 * Falls back to the raw address when no display name is present.
 */
export function parseAddress(header: string): { name: string; email: string } {
  const trimmed = header.trim()
  const match = trimmed.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (match) {
    const name = match[1].trim()
    const email = match[2].trim()
    return { name: name || email, email }
  }
  return { name: trimmed, email: trimmed }
}

/** The best display label for an email's sender. */
export function senderLabel(email: Email): string {
  return parseAddress(email.from).name
}

/** A short, human-friendly timestamp for an email's `Date` header. */
export function formatEmailDate(date: string): string {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return ''

  const now = new Date()
  const sameDay =
    parsed.getDate() === now.getDate() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getFullYear() === now.getFullYear()

  if (sameDay) {
    return parsed.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  if (parsed.getFullYear() === now.getFullYear()) {
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** A full, absolute timestamp for the reader header (e.g. "Mon, Jul 14, 2:30 PM"). */
export function formatFullDate(date: string): string {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Uppercase initials (max 2) for an avatar, derived from a sender label. */
export function initials(label: string): string {
  const cleaned = label.replace(/["']/g, '').trim()
  if (!cleaned) return '?'
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Deterministic avatar tint classes so a sender always gets the same color. */
const AVATAR_TINTS = [
  'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  'bg-orange-500/15 text-orange-600 dark:text-orange-400',
]

export function avatarTint(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length]
}

/** Gmail inbox category tabs, normalized. */
export type EmailCategory =
  | 'primary'
  | 'social'
  | 'promotions'
  | 'updates'
  | 'forums'

export const CATEGORY_STYLE: Record<
  EmailCategory,
  { label: string; className: string }
> = {
  primary: { label: 'Primary', className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  social: { label: 'Social', className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  promotions: {
    label: 'Promotions',
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  updates: { label: 'Updates', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  forums: { label: 'Forums', className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
}

function gmailCategory(labels: string[]): EmailCategory | null {
  if (labels.includes('CATEGORY_SOCIAL')) return 'social'
  if (labels.includes('CATEGORY_PROMOTIONS')) return 'promotions'
  if (labels.includes('CATEGORY_UPDATES')) return 'updates'
  if (labels.includes('CATEGORY_FORUMS')) return 'forums'
  if (labels.includes('CATEGORY_PERSONAL')) return 'primary'
  return null
}

/** Triage signals derived from an email's Gmail labels. */
export function deriveFlags(email: Email): {
  important: boolean
  starred: boolean
  category: EmailCategory | null
} {
  const labels = email.labels ?? []
  return {
    important: labels.includes('IMPORTANT'),
    starred: labels.includes('STARRED'),
    category: gmailCategory(labels),
  }
}

/** Bucket an email date into a list section header. */
export function dateBucket(date: string): 'Today' | 'Yesterday' | 'This week' | 'Earlier' {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return 'Earlier'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayMs = 24 * 60 * 60 * 1000
  const diff =
    startOfToday.getTime() -
    new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate()
    ).getTime()
  if (diff <= 0) return 'Today'
  if (diff <= dayMs) return 'Yesterday'
  if (diff < 7 * dayMs) return 'This week'
  return 'Earlier'
}

/** The inbox "folders" the sidebar can filter to. */
export type MailFolder = 'all' | 'unread' | 'starred' | 'important' | EmailCategory

/** Translate a sidebar folder into a Gmail query fragment. */
export function folderQuery(folder: MailFolder): string {
  switch (folder) {
    case 'all':
      return ''
    case 'unread':
      return 'is:unread'
    case 'starred':
      return 'is:starred'
    case 'important':
      return 'is:important'
    default:
      return `category:${folder}`
  }
}

/** Human-readable byte size, e.g. "12 KB" or "3.4 MB". */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}
