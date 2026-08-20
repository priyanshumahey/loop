"use client"

import {
  CheckIcon,
  LoaderCircleIcon,
  LockIcon,
  SendIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { requestDocumentAccess } from "@/lib/api/document-sharing"
import type { DocumentPermissionRole } from "@/lib/document-sharing"

export function RequestDocumentAccess({
  documentId,
  email,
}: {
  documentId: string
  email: string
}) {
  const [role, setRole] = useState<DocumentPermissionRole>("viewer")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await requestDocumentAccess({
        documentId,
        role,
        message: message.trim() || undefined,
      })
      setSubmitted(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to request access")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-inset px-5 py-10">
      <div className="w-full max-w-sm rounded-window bg-surface p-6 text-center shadow-raised">
        <span className="mx-auto grid size-11 place-items-center rounded-card bg-field text-ink-3 shadow-hairline">
          <LockIcon className="size-5" />
        </span>
        <h1 className="mt-4 font-heading text-xl font-semibold text-ink">
          You need access
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          Ask the owner for permission to open this document.
        </p>

        {submitted ? (
          <div className="mt-5 rounded-card bg-green-tint px-4 py-3 text-[12px] text-green shadow-hairline">
            <CheckIcon className="mx-auto mb-1 size-4" />
            Request sent. Reopen this link after the owner approves it.
          </div>
        ) : (
          <div className="mt-5 space-y-3 text-left">
            <p className="text-[10px] text-ink-3">Requesting as {email}</p>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-ink-2">
                Access needed
              </span>
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as DocumentPermissionRole)
                }
                className="h-8 w-full rounded-control border border-line bg-surface px-2 text-[12px] text-ink outline-none"
              >
                <option value="viewer">View document</option>
                <option value="editor">Edit and collaborate</option>
              </select>
            </label>
            <Input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={500}
              placeholder="Add a note for the owner (optional)"
            />
            {error && (
              <p role="alert" className="text-[11px] text-destructive">
                {error}
              </p>
            )}
            <Button
              className="w-full"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <SendIcon />
              )}
              Request access
            </Button>
          </div>
        )}

        <Link
          href="/documents"
          className="mt-5 inline-block text-[12px] text-accent-ink hover:underline"
        >
          Back to documents
        </Link>
      </div>
    </main>
  )
}