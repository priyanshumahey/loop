"use client"

import { flip, offset, type UseVirtualFloatingOptions } from "@platejs/floating"
import { getLinkAttributes } from "@platejs/link"
import {
  FloatingLinkUrlInput,
  useFloatingLinkEdit,
  useFloatingLinkEditState,
  useFloatingLinkInsert,
  useFloatingLinkInsertState,
  type LinkFloatingToolbarState,
} from "@platejs/link/react"
import { ExternalLinkIcon, LinkIcon, TextIcon, UnlinkIcon } from "lucide-react"
import { KEYS, type TLinkElement } from "platejs"
import {
  useEditorRef,
  useEditorSelection,
  useFormInputProps,
} from "platejs/react"
import { useMemo } from "react"

import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const panelClass =
  "z-50 w-auto rounded-card bg-surface p-1 text-ink shadow-overlay outline-none"
const inputClass =
  "flex h-8 w-full rounded-control border-none bg-transparent px-2 py-1 text-[13px] text-ink outline-none placeholder:text-ink-3"

export function LinkFloatingToolbar({
  state,
}: {
  state?: LinkFloatingToolbarState
}) {
  const floatingOptions: UseVirtualFloatingOptions = useMemo(
    () => ({
      middleware: [
        offset(8),
        flip({
          fallbackPlacements: ["bottom-end", "top-start", "top-end"],
          padding: 12,
        }),
      ],
      placement: "bottom-start",
    }),
    []
  )

  const insertState = useFloatingLinkInsertState({
    ...state,
    floatingOptions: { ...floatingOptions, ...state?.floatingOptions },
  })
  const {
    hidden,
    props: insertProps,
    ref: insertRef,
    textInputProps,
  } = useFloatingLinkInsert(insertState)

  const editState = useFloatingLinkEditState({
    ...state,
    floatingOptions: { ...floatingOptions, ...state?.floatingOptions },
  })
  const {
    editButtonProps,
    props: editProps,
    ref: editRef,
    unlinkButtonProps,
  } = useFloatingLinkEdit(editState)
  const formProps = useFormInputProps({ preventDefaultOnEnterKeydown: true })

  if (hidden) return null

  const input = (
    <div className="flex w-[330px] flex-col" {...formProps}>
      <div className="flex items-center">
        <LinkIcon className="ml-2 size-3.5 text-ink-3" />
        <FloatingLinkUrlInput
          className={inputClass}
          placeholder="Paste link"
          data-plate-focus
        />
      </div>
      <Separator />
      <div className="flex items-center">
        <TextIcon className="ml-2 size-3.5 text-ink-3" />
        <input
          className={inputClass}
          placeholder="Text to display"
          data-plate-focus
          {...textInputProps}
        />
      </div>
    </div>
  )

  return (
    <>
      <div ref={insertRef} className={panelClass} {...insertProps}>
        {input}
      </div>
      <div ref={editRef} className={panelClass} {...editProps}>
        {editState.isEditing ? (
          input
        ) : (
          <div className="flex items-center">
            <button
              type="button"
              className={buttonVariants({ size: "sm", variant: "ghost" })}
              {...editButtonProps}
            >
              Edit link
            </button>
            <Separator orientation="vertical" className="mx-1" />
            <LinkOpenButton />
            <Separator orientation="vertical" className="mx-1" />
            <button
              type="button"
              aria-label="Remove link"
              className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
              {...unlinkButtonProps}
            >
              <UnlinkIcon className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function LinkOpenButton() {
  const editor = useEditorRef()
  useEditorSelection()
  const entry = editor.api.node<TLinkElement>({
    match: { type: editor.getType(KEYS.link) },
  })
  const attributes = entry ? getLinkAttributes(editor, entry[0]) : {}

  return (
    <a
      {...attributes}
      className={cn(
        buttonVariants({ size: "icon-sm", variant: "ghost" }),
        "cursor-pointer"
      )}
      onMouseOver={(event) => event.stopPropagation()}
      aria-label="Open link in a new tab"
      target="_blank"
      rel="noreferrer"
    >
      <ExternalLinkIcon className="size-3.5" />
    </a>
  )
}
