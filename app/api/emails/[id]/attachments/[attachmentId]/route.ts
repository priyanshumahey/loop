import { NextResponse, type NextRequest } from 'next/server'

import { getInboxAttachment } from '@/lib/google-sync'
import { createClient } from '@/lib/supabase/server'

interface RouteParams {
  params: Promise<{ id: string; attachmentId: string }>
}

/** Strip characters that can't safely sit in a Content-Disposition filename. */
function sanitizeFilename(name: string): string {
  return name.replace(/[\r\n"\\]/g, '').replace(/[/]/g, '_').slice(0, 200) || 'attachment'
}

/**
 * GET /api/emails/[id]/attachments/[attachmentId]?name=...&type=...
 * Streams a Gmail attachment's bytes back as a download. The message id and
 * attachment id come from the message's parsed attachment list; name and type
 * are passed through for the download prompt. Always served as an attachment
 * (never rendered inline) so untrusted content can't execute in this origin.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id, attachmentId } = await params
  if (!id || !attachmentId) {
    return NextResponse.json({ error: 'Missing ids' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const filename = sanitizeFilename(searchParams.get('name') ?? 'attachment')
  const mimeType = searchParams.get('type') || 'application/octet-stream'

  try {
    const { connected, data } = await getInboxAttachment(
      supabase,
      user.id,
      id,
      attachmentId
    )
    if (!connected) {
      return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    const bytes = Buffer.from(data, 'base64url')
    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
          filename
        )}`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('Gmail attachment fetch failed:', err)
    return NextResponse.json({ error: 'Failed to load attachment' }, { status: 502 })
  }
}
