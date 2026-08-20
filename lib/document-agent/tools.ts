import { tool } from "ai"
import { z } from "zod"

import {
  createDocumentFolder,
  createDocument as dbCreateDocument,
  deleteDocumentFolder,
  deleteDocument as dbDeleteDocument,
  getDocument,
  listDocumentFolders,
  listDocuments,
  updateDocument,
} from "@/lib/db/documents"
import { EMPTY_DOCUMENT_VALUE } from "@/lib/documents"
import {
  deleteBlocksInputSchema,
  embedCalendarEventInputSchema,
  embedEmailInputSchema,
  insertBlocksInputSchema,
  inspectEditorInputSchema,
  renameEditorDocumentInputSchema,
  replaceBlocksInputSchema,
  replaceEditorDocumentInputSchema,
  replaceSelectionInputSchema,
} from "@/lib/document-agent/editor-tools"
import {
  markdownToPlateValue,
  plateValueToMarkdown,
} from "@/lib/document-agent/markdown"

function countWords(markdown: string): number {
  return markdown.trim().split(/\s+/).filter(Boolean).length
}

function currentDocumentId(documentId?: string): string {
  if (!documentId) throw new Error("No document is currently open")
  return documentId
}

export function buildDocumentTools(
  documentId?: string,
  options: { useLiveEditor?: boolean } = {}
) {
  const listUserDocuments = tool({
    description:
      "List or search the user's documents, starred and newest first. Use the title query to find a named document before reading, deleting, or referring to it.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(50).default(20),
      folderId: z.uuid().nullable().optional(),
      query: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .optional()
        .describe("Case-insensitive words from the document title."),
    }),
    execute: async ({ limit, folderId, query }) => {
      const result = await listDocuments({
        allFolders: folderId === undefined,
        folderId,
        limit,
        search: query,
      })
      if (!result.success) throw new Error(result.error)
      return {
        documents: result.data,
        count: result.data.length,
        query: query ?? null,
      }
    },
  })

  const readUserDocument = tool({
    description:
      "Read any document by its stable id as Markdown, including its title and word count. Resolve the id with listUserDocuments first.",
    inputSchema: z.object({
      documentId: z.uuid(),
    }),
    execute: async ({ documentId: id }) => {
      const result = await getDocument(id)
      if (!result.success) throw new Error(result.error)
      if (!result.data) throw new Error("Document not found")
      const markdown = plateValueToMarkdown(result.data.content)
      return {
        id,
        title: result.data.title,
        content: markdown,
        wordCount: countWords(markdown),
        updatedAt: result.data.updatedAt,
      }
    },
  })

  const listUserFolders = tool({
    description:
      "List the user's folders alphabetically. Pass null or omit parentId for top-level folders.",
    inputSchema: z.object({
      parentId: z.uuid().nullable().optional(),
    }),
    execute: async ({ parentId }) => {
      const result = await listDocumentFolders(parentId ?? null)
      if (!result.success) throw new Error(result.error)
      return { folders: result.data, count: result.data.length }
    },
  })

  const readCurrentDocument = tool({
    description:
      "Read the currently open document as Markdown, including its title and word count. Call this before answering detailed questions or proposing edits.",
    inputSchema: z.object({}),
    execute: async () => {
      const id = currentDocumentId(documentId)
      const result = await getDocument(id)
      if (!result.success) throw new Error(result.error)
      if (!result.data) throw new Error("Document not found")
      const markdown = plateValueToMarkdown(result.data.content)
      return {
        id,
        title: result.data.title,
        content: markdown,
        wordCount: countWords(markdown),
      }
    },
  })

  const createNewDocument = tool({
    description:
      "Create a new document from Markdown. Use when the user asks for a separate draft, brief, plan, or document rather than a change to the current one.",
    inputSchema: z.object({
      title: z.string().trim().min(1).max(240),
      content: z.string().default(""),
      folderId: z.uuid().nullable().optional(),
    }),
    execute: async ({ title, content, folderId }) => {
      const result = await dbCreateDocument({
        title,
        content: content ? markdownToPlateValue(content) : EMPTY_DOCUMENT_VALUE,
        creationMode: "agent",
        folderId: folderId ?? null,
      })
      if (!result.success) throw new Error(result.error)
      return {
        ok: true,
        documentId: result.data.id,
        title: result.data.title,
        updatedAt: result.data.updatedAt,
      }
    },
  })

  const createNewFolder = tool({
    description:
      "Create a folder for organizing documents. Use listUserFolders first when the user refers to an existing parent folder.",
    inputSchema: z.object({
      name: z.string().trim().min(1).max(80),
      parentId: z.uuid().nullable().optional(),
    }),
    execute: async ({ name, parentId }) => {
      const result = await createDocumentFolder({
        name,
        parentId: parentId ?? null,
      })
      if (!result.success) throw new Error(result.error)
      return {
        ok: true,
        folderId: result.data.id,
        name: result.data.name,
        parentId: result.data.parentId,
      }
    },
  })

  const moveDocumentToFolder = tool({
    description:
      "Move a document into a folder, or to the library root by passing folderId null. Resolve both ids with the list tools first.",
    inputSchema: z.object({
      documentId: z.uuid(),
      title: z.string().trim().min(1).max(240),
      folderId: z.uuid().nullable(),
      folderName: z.string().trim().min(1).max(80).nullable(),
    }),
    execute: async ({ documentId: id, title, folderId, folderName }) => {
      const result = await updateDocument({ id, folderId })
      if (!result.success) throw new Error(result.error)
      if (!result.data) throw new Error("Document not found")
      return {
        ok: true,
        documentId: id,
        title,
        folderId,
        folderName,
        updatedAt: result.data.updatedAt,
      }
    },
  })

  const deleteUserFolder = tool({
    description:
      "Delete a folder by id. Documents in it move back to the library root. Only use when the user clearly asks to delete the folder.",
    inputSchema: z.object({
      folderId: z.uuid(),
      name: z.string().trim().min(1).max(80),
    }),
    execute: async ({ folderId, name }) => {
      const result = await deleteDocumentFolder(folderId)
      if (!result.success) throw new Error(result.error)
      return { ok: true, folderId, name, deleted: true }
    },
  })

  const replaceCurrentDocument = tool({
    description:
      "Replace the current document with a complete Markdown revision. Preserve all useful existing content unless the user explicitly asks to remove it.",
    inputSchema: z.object({
      content: z.string().min(1),
      changeSummary: z.string().trim().min(1).max(240),
    }),
    execute: async ({ content, changeSummary }) => {
      const id = currentDocumentId(documentId)
      const result = await updateDocument({
        id,
        content: markdownToPlateValue(content),
        revisionSource: "agent",
      })
      if (!result.success) throw new Error(result.error)
      if (!result.data) throw new Error("Document not found")
      return {
        ok: true,
        documentId: id,
        title: result.data.title,
        updatedAt: result.data.updatedAt,
        wordCount: countWords(content),
        changeSummary,
      }
    },
  })

  const appendToCurrentDocument = tool({
    description:
      "Append a new Markdown section to the current document without changing existing content.",
    inputSchema: z.object({
      content: z.string().trim().min(1),
      changeSummary: z.string().trim().min(1).max(240),
    }),
    execute: async ({ content, changeSummary }) => {
      const id = currentDocumentId(documentId)
      const current = await getDocument(id)
      if (!current.success) throw new Error(current.error)
      if (!current.data) throw new Error("Document not found")
      const existing = plateValueToMarkdown(current.data.content).trimEnd()
      const next = `${existing}${existing ? "\n\n" : ""}${content}`
      const result = await updateDocument({
        id,
        content: markdownToPlateValue(next),
        revisionSource: "agent",
      })
      if (!result.success) throw new Error(result.error)
      if (!result.data) throw new Error("Document not found")
      return {
        ok: true,
        documentId: id,
        title: result.data.title,
        updatedAt: result.data.updatedAt,
        wordCount: countWords(next),
        changeSummary,
      }
    },
  })

  const renameCurrentDocument = tool({
    description: "Rename the currently open document.",
    inputSchema: z.object({
      title: z.string().trim().min(1).max(240),
    }),
    execute: async ({ title }) => {
      const id = currentDocumentId(documentId)
      const result = await updateDocument({
        id,
        title,
        revisionSource: "agent",
      })
      if (!result.success) throw new Error(result.error)
      if (!result.data) throw new Error("Document not found")
      return {
        ok: true,
        documentId: id,
        title: result.data.title,
        updatedAt: result.data.updatedAt,
      }
    },
  })

  const deleteUserDocument = tool({
    description:
      "Permanently delete a document by id. Only use when the user clearly asks to delete it.",
    inputSchema: z.object({
      documentId: z.uuid(),
      title: z.string().trim().min(1).max(240),
    }),
    execute: async ({ documentId: id, title }) => {
      const result = await dbDeleteDocument(id)
      if (!result.success) throw new Error(result.error)
      return { ok: true, documentId: id, title, deleted: true }
    },
  })

  const managerTools = {
    listUserDocuments,
    readUserDocument,
    listUserFolders,
    createNewDocument,
    createNewFolder,
    moveDocumentToFolder,
    deleteUserFolder,
    deleteUserDocument,
  }

  return options.useLiveEditor || !documentId
    ? managerTools
    : {
        ...managerTools,
        readCurrentDocument,
        replaceCurrentDocument,
        appendToCurrentDocument,
        renameCurrentDocument,
      }
}

export const DOCUMENT_LIBRARY_APPROVAL_TOOLS = [
  "createNewDocument",
  "createNewFolder",
  "moveDocumentToFolder",
  "deleteUserFolder",
  "deleteUserDocument",
] as const

export const DOCUMENT_APPROVAL_TOOLS = [
  ...DOCUMENT_LIBRARY_APPROVAL_TOOLS,
  "replaceCurrentDocument",
  "appendToCurrentDocument",
  "renameCurrentDocument",
] as const

/** Client-executed tools. They intentionally have no server `execute` handler. */
export function buildLiveEditorTools() {
  return {
    inspectEditor: tool({
      description:
        "Inspect the mounted editor's latest unsaved content, top-level blocks, and selection. Always call this before editing or answering detailed questions about the open document.",
      inputSchema: inspectEditorInputSchema,
    }),
    replaceSelection: tool({
      description:
        "Replace the user's current text selection directly in the mounted editor. Use only when inspectEditor reports a non-empty selection.",
      inputSchema: replaceSelectionInputSchema,
    }),
    insertBlocks: tool({
      description:
        "Insert Markdown blocks directly into the mounted editor at the start, end, before a block, or after a block. Use block indexes from inspectEditor and pass expectedAnchorText for indexed positions to prevent stale edits.",
      inputSchema: insertBlocksInputSchema,
    }),
    replaceBlocks: tool({
      description:
        "Replace an inclusive range of top-level blocks directly in the mounted editor with Markdown. Use exact block indexes and expectedText from inspectEditor so stale edits are rejected.",
      inputSchema: replaceBlocksInputSchema,
    }),
    deleteBlocks: tool({
      description:
        "Delete an inclusive range of top-level blocks directly from the mounted editor. Use exact block indexes and expectedText from inspectEditor so stale edits are rejected.",
      inputSchema: deleteBlocksInputSchema,
    }),
    replaceEditorDocument: tool({
      description:
        "Replace the complete mounted editor document with Markdown. Reserve this for broad rewrites; prefer selection or block tools for targeted edits.",
      inputSchema: replaceEditorDocumentInputSchema,
    }),
    renameEditorDocument: tool({
      description: "Rename the currently open document in the mounted editor.",
      inputSchema: renameEditorDocumentInputSchema,
    }),
    embedCalendarEvent: tool({
      description:
        "Embed a calendar event as a native card in the mounted document. First resolve the event with a calendar tool and inspectEditor, then copy its stable id and current display fields exactly. Use guarded block placement when inserting beside existing content.",
      inputSchema: embedCalendarEventInputSchema,
    }),
    embedEmail: tool({
      description:
        "Embed an email as a native card in the mounted document. First resolve the message with listEmails or readEmail and inspectEditor, then copy its stable ids and current display fields exactly. Use guarded block placement when inserting beside existing content.",
      inputSchema: embedEmailInputSchema,
    }),
  }
}
