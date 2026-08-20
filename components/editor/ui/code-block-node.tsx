"use client"

import { formatCodeBlock, isLangSupported } from "@platejs/code-block"
import {
  BracesIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
} from "lucide-react"
import {
  NodeApi,
  type TCodeBlockElement,
  type TCodeSyntaxLeaf,
} from "platejs"
import {
  PlateElement,
  PlateLeaf,
  useEditorRef,
  useElement,
  useReadOnly,
  type PlateElementProps,
  type PlateLeafProps,
} from "platejs/react"
import { useMemo, useState } from "react"

import { BlockLineNumber } from "@/components/editor/ui/line-numbers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const LANGUAGES = [
  ["Auto", "auto"],
  ["Plain Text", "plaintext"],
  ["Bash", "bash"],
  ["C", "c"],
  ["C#", "csharp"],
  ["C++", "cpp"],
  ["CSS", "css"],
  ["Dart", "dart"],
  ["Diff", "diff"],
  ["Dockerfile", "dockerfile"],
  ["Elixir", "elixir"],
  ["Go", "go"],
  ["GraphQL", "graphql"],
  ["HTML", "html"],
  ["Java", "java"],
  ["JavaScript", "javascript"],
  ["JSON", "json"],
  ["JSX", "jsx"],
  ["Kotlin", "kotlin"],
  ["LaTeX", "latex"],
  ["Lua", "lua"],
  ["Markdown", "markdown"],
  ["Mermaid", "mermaid"],
  ["Nix", "nix"],
  ["Objective-C", "objectivec"],
  ["PHP", "php"],
  ["PowerShell", "powershell"],
  ["Python", "python"],
  ["R", "r"],
  ["Ruby", "ruby"],
  ["Rust", "rust"],
  ["SCSS", "scss"],
  ["SQL", "sql"],
  ["Swift", "swift"],
  ["TOML", "toml"],
  ["TypeScript", "typescript"],
  ["TSX", "tsx"],
  ["WebAssembly", "wasm"],
  ["XML", "xml"],
  ["YAML", "yaml"],
] as const

export function CodeBlockElement(props: PlateElementProps<TCodeBlockElement>) {
  const { editor, element } = props

  return (
    <PlateElement
      className="relative py-2 **:[.hljs-addition]:text-green **:[.hljs-attr,.hljs-literal,.hljs-number,.hljs-operator,.hljs-variable]:text-blue-600 dark:**:[.hljs-attr,.hljs-literal,.hljs-number,.hljs-operator,.hljs-variable]:text-blue-400 **:[.hljs-built_in,.hljs-symbol]:text-orange **:[.hljs-comment,.hljs-code,.hljs-formula]:text-ink-3 **:[.hljs-deletion]:text-red **:[.hljs-keyword,.hljs-doctag,.hljs-type]:text-rose-600 dark:**:[.hljs-keyword,.hljs-doctag,.hljs-type]:text-rose-400 **:[.hljs-name,.hljs-selector-tag]:text-green **:[.hljs-regexp,.hljs-string]:text-emerald-700 dark:**:[.hljs-regexp,.hljs-string]:text-emerald-400 **:[.hljs-title,.hljs-title.function_]:text-violet-600 dark:**:[.hljs-title,.hljs-title.function_]:text-violet-400"
      {...props}
    >
      <BlockLineNumber />
      <div className="relative overflow-hidden rounded-card bg-[#f6f6f4] shadow-hairline dark:bg-field">
        <pre className="overflow-x-auto px-4 py-9 font-mono text-[12px] leading-relaxed [tab-size:2] print:break-inside-avoid">
          <code>{props.children}</code>
        </pre>
        <div
          className="absolute right-1.5 top-1.5 z-10 flex select-none items-center gap-0.5"
          contentEditable={false}
        >
          {isLangSupported(element.lang) && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => formatCodeBlock(editor, { element })}
              aria-label="Format code"
              title="Format code"
            >
              <BracesIcon className="size-3.5" />
            </Button>
          )}
          <CodeLanguagePicker />
          <CopyCodeButton value={() => NodeApi.string(element)} />
        </div>
      </div>
    </PlateElement>
  )
}

function CodeLanguagePicker() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const readOnly = useReadOnly()
  const editor = useEditorRef()
  const element = useElement<TCodeBlockElement>()
  const value = element.lang || "plaintext"
  const label = LANGUAGES.find((item) => item[1] === value)?.[0] ?? value
  const items = useMemo(
    () =>
      LANGUAGES.filter(([name]) =>
        name.toLowerCase().includes(search.toLowerCase())
      ),
    [search]
  )

  if (readOnly) {
    return <span className="px-2 text-[10px] text-ink-3">{label}</span>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          className="h-6 gap-1 px-2 text-[10px] text-ink-3"
          aria-expanded={open}
        >
          {label}
          <ChevronDownIcon className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-52 rounded-card p-1.5"
        onCloseAutoFocus={() => setSearch("")}
      >
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search language"
          className="mb-1.5 h-8 text-[12px]"
        />
        <div className="max-h-64 overflow-y-auto">
          {items.map(([name, language]) => (
            <button
              key={language}
              type="button"
              onClick={() => {
                editor.tf.setNodes<TCodeBlockElement>(
                  { lang: language },
                  { at: element }
                )
                setOpen(false)
                setSearch("")
              }}
              className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-[12px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
            >
              <CheckIcon
                className={cn(
                  "size-3.5",
                  language === value ? "opacity-100" : "opacity-0"
                )}
              />
              {name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CopyCodeButton({ value }: { value: () => string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      size="icon-xs"
      variant="ghost"
      onClick={() => {
        void navigator.clipboard.writeText(value())
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2_000)
      }}
      aria-label="Copy code"
      title="Copy code"
    >
      {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
    </Button>
  )
}

export function CodeLineElement(props: PlateElementProps) {
  return <PlateElement {...props} />
}

export function CodeSyntaxLeaf(props: PlateLeafProps<TCodeSyntaxLeaf>) {
  return <PlateLeaf className={props.leaf.className as string} {...props} />
}
