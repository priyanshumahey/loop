'use client'

import DOMPurify from 'isomorphic-dompurify'
import { ImageOffIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

// The app origin, needed to make image URLs absolute so they resolve inside the
// iframe's `srcdoc` document, and to tell our own inline images apart from
// remote ones. Bodies only render client-side, so reading `window` is safe.
export const APP_ORIGIN = typeof window !== 'undefined' ? window.location.origin : ''

// Force links in message bodies to open in a new tab without handing the opener
// window to the target page (reverse tabnabbing). Module bodies run once, so
// this registers a single hook on the shared DOMPurify instance.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if ((node as Element).tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Sanitize untrusted message HTML. Always the last thing done before render. */
function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}

/**
 * Strip `src`/`srcset` from remote (external) images so tracking pixels don't
 * load until the user opts in. Same-origin URLs (our own inline attachments)
 * are kept.
 */
function stripRemoteImages(html: string): { html: string; blocked: number } {
  let blocked = 0
  const out = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\ssrc=("|')(.*?)\1/i.exec(tag)?.[2] ?? ''
    const isRemote =
      /^https?:\/\//i.test(src) && !(APP_ORIGIN && src.startsWith(APP_ORIGIN))
    if (!isRemote) return tag
    blocked++
    return tag.replace(/\ssrc=("|').*?\1/i, '').replace(/\ssrcset=("|').*?\1/i, '')
  })
  return { html: out, blocked }
}

// How mail clients mark the start of the quoted history they append to a reply.
const QUOTE_MARKERS = [
  /<blockquote\b/i,
  /<div[^>]*\bclass=("|')[^"']*gmail_quote/i,
  /<div[^>]*\bid=("|')divRplyFwdMsg/i,
  /<div[^>]*\bclass=("|')[^"']*moz-cite-prefix/i,
  /-{2,}\s*Original Message\s*-{2,}/i,
  /<div[^>]*\bclass=("|')[^"']*yahoo_quoted/i,
]

/** Where the quoted history starts, or -1 when the message has none. */
function quoteIndex(html: string): number {
  let index = -1
  for (const marker of QUOTE_MARKERS) {
    const found = html.search(marker)
    if (found > 0 && (index === -1 || found < index)) index = found
  }
  return index
}

/**
 * Split a reply into the part the sender actually wrote and the quoted history
 * they replied on top of, so the history can start collapsed like every real
 * mail client does. Each half is re-sanitized, which also rebalances any tags
 * the split cut through.
 */
function splitQuotedHtml(html: string): { visible: string; quoted: string | null } {
  const index = quoteIndex(html)
  if (index === -1) return { visible: html, quoted: null }

  const visible = sanitizeEmailHtml(html.slice(0, index))
  const quoted = sanitizeEmailHtml(html.slice(index))
  // A reply that is *only* quoted history should still show something.
  if (!visible.replace(/<[^>]*>/g, '').trim()) return { visible: html, quoted: null }
  return { visible, quoted }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  bull: '\u2022',
  gt: '>',
  hellip: '\u2026',
  ldquo: '\u201C',
  lsquo: '\u2018',
  lt: '<',
  mdash: '\u2014',
  middot: '\u00B7',
  nbsp: ' ',
  ndash: '\u2013',
  quot: '"',
  rdquo: '\u201D',
  rsquo: '\u2019',
}

/** One pass, so a decoded `&amp;` can't be re-read as the start of an entity. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return NAMED_ENTITIES[entity.toLowerCase()] ?? match
    const code =
      entity[1] === 'x' || entity[1] === 'X'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : match
  })
}

/** Collapse message HTML to a plain-text preview, quoted history excluded. */
export function htmlToText(html: string): string {
  const index = quoteIndex(html)
  const stripped = (index === -1 ? html : html.slice(0, index))
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')

  return decodeEntities(stripped)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Wrap message HTML in a self-contained document. Senders author against a
 * white page with a serif-free default, so the reset mirrors what other mail
 * clients give them rather than inheriting the app's design tokens.
 */
function buildSrcDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"><style>
    html, body { margin: 0; padding: 0; color-scheme: light; }
    body {
      padding: 1px;
      font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1f2328;
      background: #ffffff;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    img { max-width: 100% !important; height: auto; border: 0; }
    a { color: #2563eb; }
    table { max-width: 100% !important; border-collapse: collapse; }
    td, th { word-break: break-word; }
    pre { white-space: pre-wrap; font-size: 13px; }
    blockquote {
      margin: 0 0 0 2px;
      padding-left: 12px;
      border-left: 2px solid #d7dae0;
      color: #5b6472;
    }
    hr { border: 0; border-top: 1px solid #e5e7eb; }
    p { margin: 0 0 12px; }
    p:last-child { margin-bottom: 0; }
    ul, ol { margin: 0 0 12px; padding-left: 22px; }
    * { box-sizing: border-box; max-width: 100%; }
  </style></head><body>${html}</body></html>`
}

/**
 * Renders sanitized message HTML in a sandboxed iframe that tracks its own
 * content height. The sandbox intentionally omits `allow-scripts`, so nothing
 * in the message can run; `allow-same-origin` only exists so we can measure the
 * document, and `allow-popups` lets the user click links through.
 *
 * Callers must sanitize before passing `html` in — the frame renders it as-is.
 */
function EmailHtmlFrame({
  html,
  title = 'Message content',
  className,
}: {
  html: string
  title?: string
  className?: string
}) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null)
  const [height, setHeight] = useState(120)
  const srcDoc = buildSrcDoc(html)

  // Measured from out here because the sandbox has no scripting: a plain
  // `onLoad` read misses images and web fonts that settle afterwards, which is
  // what leaves marketing email clipped or floating in dead space.
  useEffect(() => {
    if (!frame) return

    let observer: ResizeObserver | null = null

    const measure = () => {
      const body = frame.contentDocument?.body
      if (!body) return
      // Deliberately not `documentElement`: it stretches to the iframe's own
      // height, so feeding that back in ratchets the frame taller and never
      // lets it shrink again.
      const measured = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        Math.ceil(body.getBoundingClientRect().height)
      )
      if (measured > 0) setHeight(measured + 2)
    }

    const attach = () => {
      measure()
      const doc = frame.contentDocument
      if (!doc) return
      observer?.disconnect()
      observer = new ResizeObserver(measure)
      if (doc.body) observer.observe(doc.body)
      for (const img of Array.from(doc.images)) {
        if (!img.complete) img.addEventListener('load', measure, { once: true })
      }
    }

    // Deferred so the first measurement never lands in the effect body itself.
    const raf = requestAnimationFrame(attach)
    frame.addEventListener('load', attach)

    return () => {
      cancelAnimationFrame(raf)
      frame.removeEventListener('load', attach)
      observer?.disconnect()
    }
  }, [frame, srcDoc])

  return (
    <iframe
      ref={setFrame}
      title={title}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      style={{ height }}
      className={cn('w-full border-0 bg-white', className)}
    />
  )
}

/**
 * A complete message body: sanitized, with remote images held back behind a
 * consent bar and the quoted reply history collapsed behind the "…" control
 * every mail client uses.
 *
 * `preprocess` runs on the raw HTML before sanitizing, for callers that need to
 * resolve their own embedded (`cid:`) images first.
 */
export function RenderedEmailHtml({
  html,
  preprocess,
  title,
}: {
  html: string
  preprocess?: (html: string) => string
  title?: string
}) {
  const [showRemote, setShowRemote] = useState(false)
  const [showQuoted, setShowQuoted] = useState(false)

  const prepared = preprocess ? preprocess(html) : html
  const safe = sanitizeEmailHtml(prepared)
  const { visible, quoted } = splitQuotedHtml(safe)
  const source = showQuoted && quoted ? visible + quoted : visible
  const { html: rendered, blocked } = showRemote
    ? { html: source, blocked: 0 }
    : stripRemoteImages(source)

  return (
    <div className="flex flex-col gap-2">
      {blocked > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-3 py-1.5 text-[12px] text-muted-foreground">
          <ImageOffIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            {blocked} remote image{blocked === 1 ? '' : 's'} hidden to protect your
            privacy.
          </span>
          <button
            type="button"
            onClick={() => setShowRemote(true)}
            className="shrink-0 font-medium text-foreground underline underline-offset-2 hover:text-primary"
          >
            Show images
          </button>
        </div>
      )}

      <EmailHtmlFrame html={rendered} title={title} />

      {quoted && (
        <button
          type="button"
          onClick={() => setShowQuoted((shown) => !shown)}
          aria-expanded={showQuoted}
          aria-label={showQuoted ? 'Hide quoted text' : 'Show trimmed content'}
          title={showQuoted ? 'Hide quoted text' : 'Show quoted text'}
          className={cn(
            'flex h-4 w-8 items-center justify-center gap-[3px] self-start rounded bg-muted transition-colors hover:bg-muted-foreground/25',
            showQuoted && 'bg-muted-foreground/25'
          )}
        >
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              aria-hidden
              className="size-[3px] rounded-full bg-muted-foreground"
            />
          ))}
        </button>
      )}
    </div>
  )
}
