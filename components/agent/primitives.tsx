"use client"

import { ArrowRightIcon, ChevronDownIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type Tone = "default" | "danger" | "muted" | "success" | "warning"

const cardTone: Record<Exclude<Tone, "muted">, string> = {
  default: "",
  danger: "ring-1 ring-inset ring-destructive/20",
  success: "ring-1 ring-inset ring-emerald-500/20",
  warning: "ring-1 ring-inset ring-amber-500/25",
}

export function AgentCard({
  title,
  icon,
  meta,
  tone = "default",
  className,
  bodyClassName,
  footer,
  children,
}: {
  title: ReactNode
  icon: ReactNode
  meta?: ReactNode
  tone?: Exclude<Tone, "muted">
  className?: string
  bodyClassName?: string
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <section
      className={cn(
        "my-2 overflow-hidden rounded-card bg-surface shadow-card",
        cardTone[tone],
        className
      )}
    >
      <header className="flex min-h-9 items-center gap-2 border-b border-line bg-inset px-3 py-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-control bg-surface text-ink-2 shadow-hairline">
          {icon}
        </span>
        <div className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
          {title}
        </div>
        {meta !== undefined && (
          <div className="shrink-0 text-[11px] text-ink-3">{meta}</div>
        )}
      </header>
      <div className={cn("px-3 py-3", bodyClassName)}>{children}</div>
      {footer && (
        <footer className="flex items-center justify-end border-t border-line bg-inset px-3 py-2">
          {footer}
        </footer>
      )}
    </section>
  )
}

const noticeTone: Record<Tone, string> = {
  default: "border-line bg-inset text-ink-2",
  danger: "border-destructive/20 bg-destructive/5 text-destructive",
  muted: "border-line bg-muted/50 text-muted-foreground",
  success: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-400",
}

export function AgentNotice({
  icon,
  title,
  description,
  tone = "default",
  className,
  action,
}: {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  tone?: Tone
  className?: string
  action?: ReactNode
}) {
  return (
    <div
      className={cn(
        "my-2 flex items-center gap-2.5 rounded-card border px-3 py-2.5",
        noticeTone[tone],
        className
      )}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-control bg-current/10">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-current">{title}</p>
        {description !== undefined && (
          <p className="text-[12px] text-current/75">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function AgentContextCard({
  icon,
  label,
  meta,
  details,
  onOpen,
  onRemove,
  removeLabel = "Remove attached item",
  iconClassName,
}: {
  icon: ReactNode
  label: string
  meta: string
  details?: string
  onOpen?: () => void
  onRemove?: () => void
  removeLabel?: string
  iconClassName?: string
}) {
  const content = (
    <>
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-control bg-muted text-muted-foreground",
          iconClassName
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[12.5px] font-medium text-ink">
          {label}
        </span>
        <span className="block truncate text-[11px] text-ink-3">{meta}</span>
      </span>
    </>
  )

  return (
    <div
      className="group flex min-w-0 items-center gap-2 rounded-card bg-surface p-1.5 shadow-card"
      title={details}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {content}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">{content}</div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="grid size-7 shrink-0 place-items-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function AgentDisclosure({
  title,
  icon,
  meta,
  defaultOpen = false,
  children,
}: {
  title: ReactNode
  icon: ReactNode
  meta?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details
      open={defaultOpen || undefined}
      className="group/disclosure my-1 overflow-hidden rounded-control bg-inset shadow-hairline"
    >
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 px-2.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 opacity-70">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px]">{title}</span>
        {meta !== undefined && (
          <span className="shrink-0 text-[11px] tabular-nums opacity-70">
            {meta}
          </span>
        )}
        <ChevronDownIcon className="size-3.5 shrink-0 transition-transform group-open/disclosure:rotate-180" />
      </summary>
      <div className="border-t border-line bg-surface">{children}</div>
    </details>
  )
}

export function StarterPromptList({
  items,
  onPick,
  className,
}: {
  items: string[]
  onPick: (text: string) => void
  className?: string
}) {
  if (!items.length) return null

  return (
    <div
      className={cn(
        "w-full max-w-72 overflow-hidden rounded-card bg-surface text-left shadow-hairline",
        className
      )}
    >
      {items.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onPick(prompt)}
          className="flex min-h-10 w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-[12px] leading-snug text-ink-2 transition-colors last:border-b-0 hover:bg-hover hover:text-ink"
        >
          <span className="min-w-0 flex-1">{prompt}</span>
          <ArrowRightIcon className="size-3.5 shrink-0 text-ink-3" />
        </button>
      ))}
    </div>
  )
}

export function FollowUpSuggestions({
  items,
  onPick,
  className,
}: {
  items: string[]
  onPick: (text: string) => void
  className?: string
}) {
  if (!items.length) return null

  return (
    <div className={cn("mx-auto w-full max-w-2xl px-4 pt-2 pb-1", className)}>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((suggestion, index) => (
          <button
            key={`${index}-${suggestion}`}
            type="button"
            onClick={() => onPick(suggestion)}
            className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1.5 text-[13px] text-foreground/80 transition-colors hover:border-ring/50 hover:bg-muted/60 hover:text-foreground"
          >
            <span className="whitespace-nowrap">{suggestion}</span>
          </button>
        ))}
      </div>
    </div>
  )
}