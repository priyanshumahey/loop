"use client"

import { createPlatePlugin } from "platejs/react"

import {
  EmailEmbedElement,
  EventEmbedElement,
} from "@/components/editor/ui/source-embed-node"
import { EMAIL_EMBED_KEY, EVENT_EMBED_KEY } from "@/lib/document-embeds"

export const EventEmbedPlugin = createPlatePlugin({
  key: EVENT_EMBED_KEY,
  node: {
    component: EventEmbedElement,
    isElement: true,
    isVoid: true,
  },
})

export const EmailEmbedPlugin = createPlatePlugin({
  key: EMAIL_EMBED_KEY,
  node: {
    component: EmailEmbedElement,
    isElement: true,
    isVoid: true,
  },
})

export const SourceEmbedKit = [EventEmbedPlugin, EmailEmbedPlugin]