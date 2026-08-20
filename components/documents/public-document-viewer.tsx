"use client"

import { Plate, usePlateEditor } from "platejs/react"
import { useState } from "react"

import { createDocumentEditorKit } from "@/components/documents/document-editor-kit"
import { Editor, EditorContainer } from "@/components/ui/editor"
import type { PublicDocument } from "@/lib/document-sharing"

export function PublicDocumentViewer({ document }: { document: PublicDocument }) {
  const [plugins] = useState(() => createDocumentEditorKit(() => false))
  const editor = usePlateEditor({ plugins, value: document.content })

  return (
    <Plate editor={editor}>
      <EditorContainer className="mx-auto h-auto! min-h-[11in] w-[min(8.5in,100%)] overflow-visible! rounded-[4px] bg-white shadow-raised dark:bg-card">
        <Editor
          variant="none"
          readOnly
          className="min-h-[11in] px-[clamp(1.5rem,8vw,1in)] py-[clamp(2rem,8vw,1in)] text-[15px] leading-[1.72] text-[#1d1d1f] dark:text-foreground"
        />
      </EditorContainer>
    </Plate>
  )
}