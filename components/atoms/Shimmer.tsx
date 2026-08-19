import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

export function Shimmer({ className, style, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-block bg-clip-text text-transparent", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
        backgroundSize: "200% 100%",
        animation: "shimmer-text 1.4s linear infinite",
        ...style,
      }}
      {...props}
    />
  )
}