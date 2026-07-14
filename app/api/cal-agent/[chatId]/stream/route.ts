import {
  followStream,
  getActiveStream,
} from "@/lib/cal-agent/resumable"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

/**
 * GET /api/cal-agent/[chatId]/stream
 * Reconnect endpoint used by `useChat({ resume: true })`. Replays the assistant
 * response buffered in Redis and follows it live (waiting through the model's
 * initial thinking phase), or returns 204 when no turn is active for the chat.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const { chatId } = await params
  const streamId = await getActiveStream(user.id, chatId)
  if (!streamId) return new Response(null, { status: 204 })

  return new Response(followStream(streamId, { userId: user.id, chatId }), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
