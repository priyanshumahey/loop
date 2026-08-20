"use client"

import { getLinkAttributes } from "@platejs/link"
import type { TLinkElement } from "platejs"
import { PlateElement, type PlateElementProps } from "platejs/react"

export function LinkElement(props: PlateElementProps<TLinkElement>) {
  return (
    <PlateElement
      {...props}
      as="a"
      className="cursor-pointer font-medium text-accent-ink underline decoration-accent-ink/50 underline-offset-4"
      attributes={{
        ...props.attributes,
        ...getLinkAttributes(props.editor, props.element),
        onMouseOver: (event) => event.stopPropagation(),
      }}
    >
      {props.children}
    </PlateElement>
  )
}
