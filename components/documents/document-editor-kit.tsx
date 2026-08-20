"use client"

import {
  BlockquoteRules,
  BoldRules,
  CodeRules,
  HeadingRules,
  HighlightRules,
  HorizontalRuleRules,
  ItalicRules,
  MarkComboRules,
  StrikethroughRules,
  SubscriptRules,
  SuperscriptRules,
  UnderlineRules,
} from "@platejs/basic-nodes"
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  HighlightPlugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  KbdPlugin,
  StrikethroughPlugin,
  SubscriptPlugin,
  SuperscriptPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react"
import { FontSizePlugin, TextAlignPlugin } from "@platejs/basic-styles/react"
import { CodeBlockRules } from "@platejs/code-block"
import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from "@platejs/code-block/react"
import { IndentPlugin } from "@platejs/indent/react"
import { LinkRules } from "@platejs/link"
import { LinkPlugin } from "@platejs/link/react"
import {
  BulletedListRules,
  isOrderedList,
  OrderedListRules,
  TaskListRules,
} from "@platejs/list"
import { ListPlugin } from "@platejs/list/react"
import { MarkdownPlugin } from "@platejs/markdown"
import { MathRules } from "@platejs/math"
import { EquationPlugin, InlineEquationPlugin } from "@platejs/math/react"
import { all, createLowlight } from "lowlight"
import { KEYS, type Value } from "platejs"
import { ParagraphPlugin, type TPlateEditor } from "platejs/react"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

import { createAutoformatKit } from "@/components/editor/plugins/autoformat-kit"
import { SourceEmbedKit } from "@/components/editor/plugins/source-embed-kit"
import { BlockList } from "@/components/editor/ui/block-list"
import {
  CodeBlockElement,
  CodeLineElement,
  CodeSyntaxLeaf,
} from "@/components/editor/ui/code-block-node"
import {
  EquationElement,
  InlineEquationElement,
} from "@/components/editor/ui/equation-node"
import { LinkElement } from "@/components/editor/ui/link-node"
import { LinkFloatingToolbar } from "@/components/editor/ui/link-toolbar"
import { BlockquoteElement } from "@/components/ui/blockquote-node"
import { CodeLeaf } from "@/components/ui/code-node"
import {
  H1Element,
  H2Element,
  H3Element,
  H4Element,
  H5Element,
  H6Element,
} from "@/components/ui/heading-node"
import { HighlightLeaf } from "@/components/ui/highlight-node"
import { HrElement } from "@/components/ui/hr-node"
import { KbdLeaf } from "@/components/ui/kbd-node"
import { ParagraphElement } from "@/components/ui/paragraph-node"

const lowlight = createLowlight(all)

export function createDocumentEditorKit(isEnabled: () => boolean) {
  const enabled = () => isEnabled()

  return [
    ParagraphPlugin.withComponent(ParagraphElement),
    H1Plugin.configure({
      inputRules: [HeadingRules.markdown({ enabled })],
      node: { component: H1Element },
      rules: { break: { empty: "reset" } },
      shortcuts: { toggle: { keys: "mod+alt+1" } },
    }),
    H2Plugin.configure({
      inputRules: [HeadingRules.markdown({ enabled })],
      node: { component: H2Element },
      rules: { break: { empty: "reset" } },
      shortcuts: { toggle: { keys: "mod+alt+2" } },
    }),
    H3Plugin.configure({
      inputRules: [HeadingRules.markdown({ enabled })],
      node: { component: H3Element },
      rules: { break: { empty: "reset" } },
      shortcuts: { toggle: { keys: "mod+alt+3" } },
    }),
    H4Plugin.configure({
      inputRules: [HeadingRules.markdown({ enabled })],
      node: { component: H4Element },
      rules: { break: { empty: "reset" } },
      shortcuts: { toggle: { keys: "mod+alt+4" } },
    }),
    H5Plugin.configure({
      inputRules: [HeadingRules.markdown({ enabled })],
      node: { component: H5Element },
      rules: { break: { empty: "reset" } },
      shortcuts: { toggle: { keys: "mod+alt+5" } },
    }),
    H6Plugin.configure({
      inputRules: [HeadingRules.markdown({ enabled })],
      node: { component: H6Element },
      rules: { break: { empty: "reset" } },
      shortcuts: { toggle: { keys: "mod+alt+6" } },
    }),
    BlockquotePlugin.configure({
      inputRules: [BlockquoteRules.markdown({ enabled })],
      node: { component: BlockquoteElement },
      shortcuts: { toggle: { keys: "mod+shift+period" } },
    }),
    HorizontalRulePlugin.configure({
      inputRules: [
        HorizontalRuleRules.markdown({ enabled, variant: "-" }),
        HorizontalRuleRules.markdown({ enabled, variant: "_" }),
      ],
      node: { component: HrElement },
    }),
    BoldPlugin.configure({
      inputRules: [
        BoldRules.markdown({ enabled, variant: "*" }),
        BoldRules.markdown({ enabled, variant: "_" }),
        MarkComboRules.markdown({ enabled, variant: "boldItalic" }),
        MarkComboRules.markdown({ enabled, variant: "boldUnderline" }),
        MarkComboRules.markdown({ enabled, variant: "boldItalicUnderline" }),
        MarkComboRules.markdown({ enabled, variant: "italicUnderline" }),
      ],
    }),
    ItalicPlugin.configure({
      inputRules: [
        ItalicRules.markdown({ enabled, variant: "*" }),
        ItalicRules.markdown({ enabled, variant: "_" }),
      ],
    }),
    UnderlinePlugin.configure({
      inputRules: [UnderlineRules.markdown({ enabled })],
    }),
    CodePlugin.configure({
      inputRules: [CodeRules.markdown({ enabled })],
      node: { component: CodeLeaf },
      shortcuts: { toggle: { keys: "mod+e" } },
    }),
    StrikethroughPlugin.configure({
      inputRules: [StrikethroughRules.markdown({ enabled })],
      shortcuts: { toggle: { keys: "mod+shift+x" } },
    }),
    SubscriptPlugin.configure({
      inputRules: [SubscriptRules.markdown({ enabled })],
      shortcuts: { toggle: { keys: "mod+comma" } },
    }),
    SuperscriptPlugin.configure({
      inputRules: [SuperscriptRules.markdown({ enabled })],
      shortcuts: { toggle: { keys: "mod+period" } },
    }),
    HighlightPlugin.configure({
      inputRules: [
        HighlightRules.markdown({ enabled, variant: "==" }),
        HighlightRules.markdown({ enabled, variant: "≡" }),
      ],
      node: { component: HighlightLeaf },
      shortcuts: { toggle: { keys: "mod+shift+h" } },
    }),
    KbdPlugin.withComponent(KbdLeaf),
    FontSizePlugin,
    TextAlignPlugin.configure({
      inject: {
        nodeProps: {
          defaultNodeValue: "start",
          nodeKey: "align",
          styleKey: "textAlign",
          validNodeValues: ["start", "left", "center", "right", "end", "justify"],
        },
        targetPlugins: [...KEYS.heading, KEYS.p, KEYS.blockquote],
      },
    }),
    IndentPlugin.configure({
      inject: {
        targetPlugins: [
          ...KEYS.heading,
          KEYS.p,
          KEYS.blockquote,
          KEYS.codeBlock,
        ],
      },
      options: { offset: 24 },
    }),
    ListPlugin.configure({
      inputRules: [
        BulletedListRules.markdown({ enabled, variant: "-" }),
        BulletedListRules.markdown({ enabled, variant: "*" }),
        OrderedListRules.markdown({ enabled, variant: "." }),
        OrderedListRules.markdown({ enabled, variant: ")" }),
        TaskListRules.markdown({ checked: false, enabled }),
        TaskListRules.markdown({ checked: true, enabled }),
      ],
      inject: {
        nodeProps: {
          nodeKey: KEYS.listType,
          query: ({ nodeProps }) => {
            const element = nodeProps.element
            if (!element?.listStyleType) return false
            return !isOrderedList(element)
          },
          transformProps: ({ props }) => ({
            ...props,
            role: "listitem",
            style: { ...props.style, display: "list-item" },
          }),
        },
        targetPlugins: [
          ...KEYS.heading,
          KEYS.p,
          KEYS.blockquote,
          KEYS.codeBlock,
        ],
      },
      render: { belowNodes: BlockList },
    }),
    CodeBlockPlugin.configure({
      inputRules: [CodeBlockRules.markdown({ enabled, on: "match" })],
      node: { component: CodeBlockElement },
      options: { lowlight },
      shortcuts: { toggle: { keys: "mod+alt+8" } },
    }),
    CodeLinePlugin.withComponent(CodeLineElement),
    CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
    LinkPlugin.configure({
      inputRules: [
        LinkRules.markdown({ enabled }),
        LinkRules.autolink({ variant: "paste" }),
        LinkRules.autolink({ variant: "space" }),
        LinkRules.autolink({ variant: "break" }),
      ],
      render: {
        node: LinkElement,
        afterEditable: () => <LinkFloatingToolbar />,
      },
    }),
    InlineEquationPlugin.configure({
      inputRules: [MathRules.markdown({ enabled, variant: "$" })],
      node: { component: InlineEquationElement },
    }),
    EquationPlugin.configure({
      inputRules: [MathRules.markdown({ enabled, on: "break", variant: "$$" })],
      node: { component: EquationElement },
    }),
    ...SourceEmbedKit,
    MarkdownPlugin.configure({
      options: { remarkPlugins: [remarkGfm, remarkMath] },
    }),
    ...createAutoformatKit(isEnabled),
  ]
}

export type LoopDocumentEditor = TPlateEditor<
  Value,
  ReturnType<typeof createDocumentEditorKit>[number]
>
