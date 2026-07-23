import type { GmailMessage } from '@/lib/google'

/** Client-facing email shape (identical to the server's GmailMessage). */
export type Email = GmailMessage

const API_BASE = '/api/emails'

interface ApiResponse<T> {
  data?: T
  error?: string
}

/**
 * List the user's most recent inbox messages. `connected` is false when the
 * user has not linked Google.
 */
export async function listEmails(params?: {
  maxResults?: number
  query?: string
  pageToken?: string
  allMail?: boolean
}): Promise<{ emails: Email[]; connected: boolean; nextPageToken: string | null }> {
  const search = new URLSearchParams()
  if (params?.maxResults) search.set('maxResults', String(params.maxResults))
  if (params?.query) search.set('q', params.query)
  if (params?.pageToken) search.set('pageToken', params.pageToken)
  if (params?.allMail) search.set('allMail', '1')

  const qs = search.toString()
  const response = await fetch(`${API_BASE}${qs ? `?${qs}` : ''}`)

  if (!response.ok) {
    const error: ApiResponse<never> = await response.json()
    throw new Error(error.error || 'Failed to load emails')
  }

  const result: ApiResponse<Email[]> & {
    connected?: boolean
    nextPageToken?: string | null
  } = await response.json()

  return {
    emails: result.data ?? [],
    connected: Boolean(result.connected),
    nextPageToken: result.nextPageToken ?? null,
  }
}

/** Fetch a single message in full, including the parsed body. */
export async function getEmail(id: string): Promise<Email> {
  const response = await fetch(`${API_BASE}/${id}`)

  if (!response.ok) {
    const error: ApiResponse<never> = await response.json()
    throw new Error(error.error || 'Failed to load email')
  }

  const result: ApiResponse<Email> = await response.json()
  return result.data!
}

/** Build a download URL for one of a message's attachments. */
export function attachmentUrl(
  messageId: string,
  att: { attachmentId: string; filename: string; mimeType: string }
): string {
  const params = new URLSearchParams({
    name: att.filename,
    type: att.mimeType,
  })
  return `${API_BASE}/${messageId}/attachments/${att.attachmentId}?${params.toString()}`
}
