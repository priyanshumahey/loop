import { z } from "zod"

import type {
  EmailEmbedSnapshot,
  EventEmbedSnapshot,
} from "@/lib/document-embeds"

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

const expectedRevisionSchema = z
  .string()
  .min(1)
  .max(100)
  .describe("The opaque revision returned by the latest inspectEditor call.")

export const replaceSelectionInputSchema = z.object({
  replacement: z.string(),
  expectedRevision: expectedRevisionSchema,
  expectedText: z.string().optional(),
  changeSummary: z.string().trim().min(1).max(240),
})

export const insertBlocksInputSchema = z.object({
  markdown: z.string().min(1),
  expectedRevision: expectedRevisionSchema,
  position: z.enum(["start", "end", "beforeBlock", "afterBlock"]),
  blockIndex: z.number().int().min(0).optional(),
  expectedAnchorText: z.string().optional(),
  changeSummary: z.string().trim().min(1).max(240),
})

export const replaceBlocksInputSchema = z.object({
  startIndex: z.number().int().min(0),
  endIndex: z.number().int().min(0),
  markdown: z.string().min(1),
  expectedRevision: expectedRevisionSchema,
  expectedText: z.string().optional(),
  changeSummary: z.string().trim().min(1).max(240),
})

export const deleteBlocksInputSchema = z.object({
  startIndex: z.number().int().min(0),
  endIndex: z.number().int().min(0),
  expectedRevision: expectedRevisionSchema,
  expectedText: z.string().optional(),
  changeSummary: z.string().trim().min(1).max(240),
})

export const replaceEditorDocumentInputSchema = z.object({
  markdown: z.string().min(1),
  expectedRevision: expectedRevisionSchema,
  changeSummary: z.string().trim().min(1).max(240),
})

export const renameEditorDocumentInputSchema = z.object({
  title: z.string().trim().min(1).max(240),
})

const embedPlacementSchema = z
  .object({
    expectedRevision: expectedRevisionSchema,
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

const calendarEventSourceSchema = z.object({
  eventId: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .describe("A stable event id returned by a calendar tool."),
})

const emailSourceSchema = z.object({
  emailId: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .describe("A stable message id returned by an email tool."),
})

export const embedCalendarEventInputSchema = embedPlacementSchema.extend(
  calendarEventSourceSchema.shape
)

export const embedEmailInputSchema = embedPlacementSchema.extend(
  emailSourceSchema.shape
)

const embedTargetSchema = z.object({
  expectedRevision: expectedRevisionSchema,
  blockIndex: z.number().int().min(0),
  expectedSourceId: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .describe("The current source id returned for this block by inspectEditor."),
  changeSummary: z.string().trim().min(1).max(240),
})

export const updateEmbeddedCalendarEventInputSchema =
  embedTargetSchema.extend(calendarEventSourceSchema.shape)

export const updateEmbeddedEmailInputSchema = embedTargetSchema.extend(
  emailSourceSchema.shape
)

export const removeSourceEmbedInputSchema = embedTargetSchema.extend({
  sourceType: z.enum(["event", "email"]),
  sourceLabel: z.string().trim().min(1).max(1_000).optional(),
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
  "updateEmbeddedCalendarEvent",
  "updateEmbeddedEmail",
  "removeSourceEmbed",
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
  "updateEmbeddedCalendarEvent",
  "updateEmbeddedEmail",
  "removeSourceEmbed",
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
  | { toolName: "updateEmbeddedCalendarEvent"; input: z.infer<typeof updateEmbeddedCalendarEventInputSchema> }
  | { toolName: "updateEmbeddedEmail"; input: z.infer<typeof updateEmbeddedEmailInputSchema> }
  | { toolName: "removeSourceEmbed"; input: z.infer<typeof removeSourceEmbedInputSchema> }

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
  embed?:
    | {
        sourceType: "event"
        sourceId: string
        snapshot: EventEmbedSnapshot
      }
    | {
        sourceType: "email"
        sourceId: string
        snapshot: EmailEmbedSnapshot
      }
}

export interface EditorSelectionSnapshot {
  text: string
  startBlock: number
  endBlock: number
}

export interface EditorSnapshot {
  revision: string
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
    case "updateEmbeddedCalendarEvent":
      return {
        toolName,
        input: updateEmbeddedCalendarEventInputSchema.parse(input),
      }
    case "updateEmbeddedEmail":
      return { toolName, input: updateEmbeddedEmailInputSchema.parse(input) }
    case "removeSourceEmbed":
      return { toolName, input: removeSourceEmbedInputSchema.parse(input) }
  }
}
