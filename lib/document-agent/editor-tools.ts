import { z } from "zod"

export const selectedTextContextSchema = z
  .object({
    text: z.string().min(1).max(10_000),
    startBlock: z.number().int().min(0),
    endBlock: z.number().int().min(0),
    intent: z.enum(["improve", "shorten", "tone"]).optional(),
  })
  .refine((context) => context.endBlock >= context.startBlock)

export type SelectedTextContext = z.infer<typeof selectedTextContextSchema>

export const inspectEditorInputSchema = z.object({})

export const replaceSelectionInputSchema = z.object({
  replacement: z.string(),
  expectedText: z.string().optional(),
  changeSummary: z.string().trim().min(1).max(240),
})

export const insertBlocksInputSchema = z.object({
  markdown: z.string().min(1),
  position: z.enum(["start", "end", "beforeBlock", "afterBlock"]),
  blockIndex: z.number().int().min(0).optional(),
  expectedAnchorText: z.string().optional(),
  changeSummary: z.string().trim().min(1).max(240),
})

export const replaceBlocksInputSchema = z.object({
  startIndex: z.number().int().min(0),
  endIndex: z.number().int().min(0),
  markdown: z.string().min(1),
  expectedText: z.string().optional(),
  changeSummary: z.string().trim().min(1).max(240),
})

export const deleteBlocksInputSchema = z.object({
  startIndex: z.number().int().min(0),
  endIndex: z.number().int().min(0),
  expectedText: z.string().optional(),
  changeSummary: z.string().trim().min(1).max(240),
})

export const replaceEditorDocumentInputSchema = z.object({
  markdown: z.string().min(1),
  changeSummary: z.string().trim().min(1).max(240),
})

export const renameEditorDocumentInputSchema = z.object({
  title: z.string().trim().min(1).max(240),
})

const embedPlacementSchema = z
  .object({
    position: z
      .enum(["start", "end", "beforeBlock", "afterBlock"])
      .default("end"),
    blockIndex: z.number().int().min(0).optional(),
    expectedAnchorText: z.string().optional(),
    changeSummary: z.string().trim().min(1).max(240),
  })
  .refine(
    (input) =>
      (input.position !== "beforeBlock" && input.position !== "afterBlock") ||
      input.blockIndex !== undefined,
    { message: "blockIndex is required for indexed placement" }
  )

export const embedCalendarEventInputSchema = embedPlacementSchema.extend({
  eventId: z.string().trim().min(1).max(240),
  title: z.string().trim().min(1).max(500),
  start: z.string().trim().min(1).max(100),
  end: z.string().trim().min(1).max(100),
  allDay: z.boolean().optional(),
  location: z.string().trim().max(500).optional(),
  color: z.string().trim().max(40).optional(),
  description: z.string().trim().max(2_000).optional(),
  timezone: z.string().trim().max(100).optional(),
  recurrence: z
    .object({
      frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
      interval: z.number().int().min(1).max(99).optional(),
      byWeekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      ends: z.enum(["never", "on", "after"]).optional(),
      until: z.string().trim().max(20).optional(),
      count: z.number().int().min(1).max(999).optional(),
      readOnly: z.boolean().optional(),
    })
    .optional(),
})

export const embedEmailInputSchema = embedPlacementSchema.extend({
  emailId: z.string().trim().min(1).max(240),
  threadId: z.string().trim().min(1).max(240),
  from: z.string().trim().min(1).max(500),
  subject: z.string().trim().min(1).max(1_000),
  date: z.string().trim().min(1).max(100),
  snippet: z.string().trim().max(2_000),
  to: z.string().trim().max(2_000).optional(),
  cc: z.string().trim().max(2_000).optional(),
  bodyPreview: z.string().trim().max(2_000).optional(),
  labels: z.array(z.string().trim().max(100)).max(20).optional(),
  unread: z.boolean().optional(),
  hasAttachments: z.boolean().optional(),
  messageCount: z.number().int().min(1).max(10_000).optional(),
  attachments: z
    .array(
      z.object({
        attachmentId: z.string().trim().min(1).max(500),
        filename: z.string().trim().min(1).max(1_000),
        mimeType: z.string().trim().min(1).max(200),
        size: z.number().int().min(0),
      })
    )
    .max(8)
    .optional(),
})

export const EDITOR_TOOL_NAMES = [
  "inspectEditor",
  "replaceSelection",
  "insertBlocks",
  "replaceBlocks",
  "deleteBlocks",
  "replaceEditorDocument",
  "renameEditorDocument",
  "embedCalendarEvent",
  "embedEmail",
] as const

export const EDITOR_WRITE_TOOL_NAMES = [
  "replaceSelection",
  "insertBlocks",
  "replaceBlocks",
  "deleteBlocks",
  "replaceEditorDocument",
  "renameEditorDocument",
  "embedCalendarEvent",
  "embedEmail",
] as const

export type EditorToolName = (typeof EDITOR_TOOL_NAMES)[number]
export type EditorWriteToolName = (typeof EDITOR_WRITE_TOOL_NAMES)[number]

export type EditorToolInput =
  | { toolName: "inspectEditor"; input: z.infer<typeof inspectEditorInputSchema> }
  | { toolName: "replaceSelection"; input: z.infer<typeof replaceSelectionInputSchema> }
  | { toolName: "insertBlocks"; input: z.infer<typeof insertBlocksInputSchema> }
  | { toolName: "replaceBlocks"; input: z.infer<typeof replaceBlocksInputSchema> }
  | { toolName: "deleteBlocks"; input: z.infer<typeof deleteBlocksInputSchema> }
  | { toolName: "replaceEditorDocument"; input: z.infer<typeof replaceEditorDocumentInputSchema> }
  | { toolName: "renameEditorDocument"; input: z.infer<typeof renameEditorDocumentInputSchema> }
  | { toolName: "embedCalendarEvent"; input: z.infer<typeof embedCalendarEventInputSchema> }
  | { toolName: "embedEmail"; input: z.infer<typeof embedEmailInputSchema> }

export interface EditorToolResult {
  ok: boolean
  error?: string
  [key: string]: unknown
}

export interface EditorBlockSnapshot {
  index: number
  type: string
  text: string
  markdown: string
  indent?: number
  listStyleType?: string
  checked?: boolean
  language?: string
  texExpression?: string
}

export interface EditorSelectionSnapshot {
  text: string
  startBlock: number
  endBlock: number
}

export interface EditorSnapshot {
  title: string
  markdown: string
  wordCount: number
  blocks: EditorBlockSnapshot[]
  selection: EditorSelectionSnapshot | null
}

export function isEditorToolName(value: string): value is EditorToolName {
  return (EDITOR_TOOL_NAMES as readonly string[]).includes(value)
}

export function isEditorWriteToolName(
  value: string
): value is EditorWriteToolName {
  return (EDITOR_WRITE_TOOL_NAMES as readonly string[]).includes(value)
}

export function parseEditorToolInput(
  toolName: EditorToolName,
  input: unknown
): EditorToolInput {
  switch (toolName) {
    case "inspectEditor":
      return { toolName, input: inspectEditorInputSchema.parse(input) }
    case "replaceSelection":
      return { toolName, input: replaceSelectionInputSchema.parse(input) }
    case "insertBlocks":
      return { toolName, input: insertBlocksInputSchema.parse(input) }
    case "replaceBlocks":
      return { toolName, input: replaceBlocksInputSchema.parse(input) }
    case "deleteBlocks":
      return { toolName, input: deleteBlocksInputSchema.parse(input) }
    case "replaceEditorDocument":
      return { toolName, input: replaceEditorDocumentInputSchema.parse(input) }
    case "renameEditorDocument":
      return { toolName, input: renameEditorDocumentInputSchema.parse(input) }
    case "embedCalendarEvent":
      return { toolName, input: embedCalendarEventInputSchema.parse(input) }
    case "embedEmail":
      return { toolName, input: embedEmailInputSchema.parse(input) }
  }
}
