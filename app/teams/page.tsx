import { Suspense } from "react"

import { TeamsWorkspace } from "@/components/teams/teams-workspace"

export const metadata = {
  title: "Teams prototype · Loop",
  robots: { index: false, follow: false },
}

export default function TeamsPage() {
  return (
    <Suspense fallback={null}>
      <TeamsWorkspace />
    </Suspense>
  )
}
