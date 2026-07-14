import { Redis } from "ioredis"

/**
 * Durable resumable streaming for the calendar agent.
 *
 * The producer appends the assistant's SSE chunks to a per-response Redis Stream
 * (`XADD`). Because the events live in Redis — not in the producer's memory — a
 * client that reconnects (a refresh mid-answer, or a second tab) can replay
 * everything buffered so far and then follow the rest live, even if the original
 * request already finished. Needs the `REDIS_URL` TCP endpoint (e.g. Upstash's
 * `rediss://` URL).
 */

let redis: Redis | null = null

function requireRedisUrl(): string {
  const url = process.env.REDIS_URL || process.env.KV_URL
  if (!url) throw new Error("REDIS_URL is not set")
  return url
}

/** Shared ioredis client for pointer + XADD writes. */
function getRedis(): Redis {
  if (!redis) redis = new Redis(requireRedisUrl())
  return redis
}

// A stream can't outlive the route's `maxDuration` (30s), so the active-stream
// pointer only needs to survive a little longer than that. A short TTL means a
// stale pointer (e.g. a producer that died mid-write) clears itself in ~2 min.
const ACTIVE_TTL_SECONDS = 120
// How long the buffered event log lives after its last write. Long enough to
// resume across a reload, short enough not to accumulate.
const STREAM_TTL_SECONDS = 10 * 60

/** Namespaced by user so one user can't resume another's stream. */
const activeKey = (userId: string, chatId: string) =>
  `cal-agent:active-stream:${userId}:${chatId}`
const streamKey = (streamId: string) => `cal-agent:stream:${streamId}`

export async function setActiveStream(
  userId: string,
  chatId: string,
  streamId: string,
): Promise<void> {
  await getRedis().set(activeKey(userId, chatId), streamId, "EX", ACTIVE_TTL_SECONDS)
}

export async function getActiveStream(
  userId: string,
  chatId: string,
): Promise<string | null> {
  return getRedis().get(activeKey(userId, chatId))
}

/** Drop the pointer once a stream finishes so later mounts don't try to resume it. */
export async function clearActiveStream(userId: string, chatId: string): Promise<void> {
  await getRedis().del(activeKey(userId, chatId))
}

/**
 * Drain the assistant's SSE stream into a durable Redis Stream.
 *
 * Chunks are coalesced over a short window (`flushMs`, or `maxChars`) before
 * each `XADD`, so a token-by-token reply becomes a handful of Redis writes
 * instead of hundreds. A terminal `done`/`error` entry marks the end so a
 * consumer knows when to stop following. Runs to completion even if the original
 * client disconnected (call it inside `after`).
 */
export async function persistStream(
  streamId: string,
  source: ReadableStream<string>,
  { flushMs = 250, maxChars = 16_384 }: { flushMs?: number; maxChars?: number } = {},
): Promise<void> {
  const r = getRedis()
  const key = streamKey(streamId)
  const reader = source.getReader()

  let buffer = ""
  let started = false
  let lastFlush = Date.now()

  const flush = async () => {
    if (!buffer) return
    const out = buffer
    buffer = ""
    if (!started) {
      // Set the log's TTL atomically with its first entry so an orphaned stream
      // (producer killed before it finishes) still expires.
      started = true
      await r.pipeline().xadd(key, "*", "d", out).expire(key, STREAM_TTL_SECONDS).exec()
    } else {
      await r.xadd(key, "*", "d", out)
    }
    lastFlush = Date.now()
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) buffer += value
      if (buffer.length >= maxChars || Date.now() - lastFlush >= flushMs) {
        await flush()
      }
    }
    await flush()
    await r.xadd(key, "*", "done", "1")
  } catch (err) {
    await flush().catch(() => {})
    await r.xadd(key, "*", "error", "1").catch(() => {})
    throw err
  } finally {
    await r.expire(key, STREAM_TTL_SECONDS).catch(() => {})
  }
}

type XReadReply =
  | Array<[key: string, entries: Array<[id: string, fields: string[]]>]>
  | null

/**
 * Replay a stream's buffered chunks from the start, then follow it live until it
 * ends. Waits for the first token even if the producer is still "thinking" (the
 * Redis Stream key won't exist yet), and stops on the terminal `done`/`error`
 * entry, when the turn is no longer the active stream, or after an idle cap.
 * Uses a dedicated blocking connection so `XREAD BLOCK` never ties up the shared
 * client. Returns SSE bytes ready to hand to a `Response`.
 */
export function followStream(
  streamId: string,
  owner: { userId: string; chatId: string },
): ReadableStream<Uint8Array> {
  const key = streamKey(streamId)
  const encoder = new TextEncoder()
  const conn = getRedis().duplicate()
  const IDLE_CAP_MS = 45_000
  let cursor = "0"
  let lastData = Date.now()

  const close = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    try {
      controller.close()
    } catch {
      // already closed
    }
    conn.disconnect()
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        for (;;) {
          const reply = (await conn.xread(
            "COUNT",
            100,
            "BLOCK",
            5000,
            "STREAMS",
            key,
            cursor,
          )) as XReadReply

          if (!reply) {
            // Nothing this cycle. The producer may still be thinking before its
            // first token, so keep waiting — but stop once this turn is no
            // longer the active stream (finished/cleared) or we've idled too long.
            const active = await getActiveStream(owner.userId, owner.chatId)
            if (active !== streamId || Date.now() - lastData > IDLE_CAP_MS) {
              return close(controller)
            }
            continue
          }

          lastData = Date.now()
          const [, entries] = reply[0]
          for (const [id, fields] of entries) {
            cursor = id
            const record: Record<string, string> = {}
            for (let i = 0; i < fields.length; i += 2) record[fields[i]] = fields[i + 1]
            if (record.done !== undefined || record.error !== undefined) {
              return close(controller)
            }
            if (record.d !== undefined) controller.enqueue(encoder.encode(record.d))
          }
          return
        }
      } catch (err) {
        conn.disconnect()
        try {
          controller.error(err)
        } catch {
          // already errored/closed
        }
      }
    },
    cancel() {
      conn.disconnect()
    },
  })
}
