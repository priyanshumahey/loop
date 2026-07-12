import Link from "next/link"

import { LoopLogo } from "@/components/loop-logo"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sky-canvas relative flex min-h-svh w-full flex-col items-center justify-center gap-8 p-6">
      <Link href="/" aria-label="Loop home">
        <LoopLogo />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
