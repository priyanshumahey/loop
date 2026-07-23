import { createOpenAI } from "@ai-sdk/openai"

/**
 * Azure OpenAI, consumed through the AI SDK's OpenAI provider. Our Azure v1
 * endpoint is OpenAI-compatible and accepts Bearer auth, so we point the
 * standard provider at it.
 */
const provider = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
})

/** The calendar agent's model. `.chat()` forces the chat-completions API. */
export const calModel = provider.chat(process.env.COPILOT_MODEL ?? "gpt-5.4")

/**
 * A small, fast model for lightweight side-tasks (e.g. predicting follow-up
 * suggestions). Falls back to the main model when no mini deployment is set.
 */
export const suggestModel = provider.chat(
  process.env.COPILOT_SUGGEST_MODEL ??
    process.env.COPILOT_MODEL ??
    "gpt-4o-mini"
)
