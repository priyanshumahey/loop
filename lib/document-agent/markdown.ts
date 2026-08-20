import "server-only"

import {
  BaseBlockquotePlugin,
  BaseBoldPlugin,
  BaseCodePlugin,
  BaseH1Plugin,
  BaseH2Plugin,
  BaseH3Plugin,
  BaseH4Plugin,
  BaseH5Plugin,
  BaseH6Plugin,
  BaseHorizontalRulePlugin,
  BaseItalicPlugin,
  BaseHighlightPlugin,
  BaseSubscriptPlugin,
  BaseSuperscriptPlugin,
  BaseStrikethroughPlugin,
  BaseUnderlinePlugin,
} from "@platejs/basic-nodes"
import {
  BaseFontSizePlugin,
  BaseTextAlignPlugin,
} from "@platejs/basic-styles"
import {
  BaseCodeBlockPlugin,
  BaseCodeLinePlugin,
  BaseCodeSyntaxPlugin,
} from "@platejs/code-block"
import { BaseIndentPlugin } from "@platejs/indent"
import { BaseLinkPlugin } from "@platejs/link"
import { BaseListPlugin } from "@platejs/list"
import { MarkdownPlugin, remarkMdx } from "@platejs/markdown"
import { BaseEquationPlugin, BaseInlineEquationPlugin } from "@platejs/math"
import {
  BaseTableCellHeaderPlugin,
  BaseTableCellPlugin,
  BaseTablePlugin,
  BaseTableRowPlugin,
} from "@platejs/table"
import type { Value } from "platejs"
import { BaseParagraphPlugin, createSlateEditor } from "platejs"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

import { projectEmbedsForMarkdown } from "@/lib/document-embeds"

function createMarkdownEditor() {
  return createSlateEditor({
    plugins: [
      BaseParagraphPlugin,
      BaseH1Plugin,
      BaseH2Plugin,
      BaseH3Plugin,
      BaseH4Plugin,
      BaseH5Plugin,
      BaseH6Plugin,
      BaseBlockquotePlugin,
      BaseHorizontalRulePlugin,
      BaseBoldPlugin,
      BaseItalicPlugin,
      BaseUnderlinePlugin,
      BaseCodePlugin,
      BaseStrikethroughPlugin,
      BaseHighlightPlugin,
      BaseSubscriptPlugin,
      BaseSuperscriptPlugin,
      BaseFontSizePlugin,
      BaseTextAlignPlugin,
      BaseIndentPlugin,
      BaseCodeBlockPlugin,
      BaseCodeLinePlugin,
      BaseCodeSyntaxPlugin,
      BaseListPlugin,
      BaseLinkPlugin,
      BaseEquationPlugin,
      BaseInlineEquationPlugin,
      BaseTablePlugin,
      BaseTableRowPlugin,
      BaseTableCellPlugin,
      BaseTableCellHeaderPlugin,
      MarkdownPlugin.configure({
        options: { remarkPlugins: [remarkGfm, remarkMdx, remarkMath] },
      }),
    ],
  })
}

export function markdownToPlateValue(markdown: string): Value {
  return createMarkdownEditor().api.markdown.deserialize(markdown)
}

export function plateValueToMarkdown(value: Value): string {
  return createMarkdownEditor().api.markdown.serialize({
    value: projectEmbedsForMarkdown(value),
  })
}
