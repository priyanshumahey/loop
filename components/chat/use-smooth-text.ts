import { useEffect, useRef, useState } from "react"

/**
 * Smoothly reveal streamed text so bursty token chunks (and fast resume replays)
 * read as a steady, continuous flow instead of jumping. While `streaming`, the
 * visible text advances at a steady per-second cadence — fast enough to keep up,
 * slow enough to never "dump" a whole chunk at once — easing up gently when it's
 * far behind. When streaming ends (or is off for a restored message) the full
 * text shows at once.
 */
export function useSmoothText(text: string, streaming: boolean): string {
  const [visible, setVisible] = useState(streaming ? 0 : text.length)
  const visibleRef = useRef(visible)
  const lastRef = useRef(0)

  useEffect(() => {
    if (!streaming) return
    let raf = 0
    const step = (now: number) => {
      // Frame delta, clamped so a tab-away / dropped frame doesn't jump.
      const dt = lastRef.current ? Math.min(now - lastRef.current, 48) : 16
      lastRef.current = now

      const current = visibleRef.current
      const backlog = text.length - current
      if (backlog <= 0) {
        raf = 0
        lastRef.current = 0
        return
      }

      // Steady cadence: ~120 chars/s baseline so there's always gentle motion,
      // scaling up with the backlog (clear it in ~1/3s) but capped so a big
      // burst reveals as a smooth fast sweep rather than a single-frame jump.
      const perSecond = Math.min(1400, Math.max(120, backlog * 3))
      const advance = Math.max(1, Math.round((perSecond * dt) / 1000))
      const next = Math.min(text.length, current + advance)
      visibleRef.current = next
      setVisible(next)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      lastRef.current = 0
    }
  }, [text, streaming])

  if (!streaming || visible >= text.length) return text

  // Render up to the last whole word so a partial trailing token doesn't flash
  // half-formed markdown (e.g. `*`, `**`, `**b`) and reflow every frame. If the
  // current token is long (URL, code) with no nearby boundary, just show it.
  const slice = text.slice(0, visible)
  const boundary = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"))
  return boundary > 0 && boundary > visible - 24 ? slice.slice(0, boundary) : slice
}
