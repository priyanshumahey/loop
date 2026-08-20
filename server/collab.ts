import { Server } from "@hocuspocus/server"
import { execFileSync } from "node:child_process"
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js"
import * as Y from "yjs"

type DocumentRole = "owner" | "editor" | "viewer"

interface CollaborationContext {
  userId: string
  email: string
  name: string
  role: DocumentRole
  tokenExpiresAt: number | null
  lastAuthorizationCheck: number
}

const port = Number(process.env.HOCUSPOCUS_PORT ?? 8888)
const documentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function localSupabaseConfig(): {
  apiUrl?: string
  serviceRoleKey?: string
} {
  if (process.env.NODE_ENV === "production") return {}
  try {
    const output = execFileSync("supabase", ["status", "--output", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    const status = JSON.parse(output) as {
      API_URL?: string
      SERVICE_ROLE_KEY?: string
    }
    return {
      apiUrl: status.API_URL,
      serviceRoleKey: status.SERVICE_ROLE_KEY,
    }
  } catch {
    return {}
  }
}

function getAdminClient(): SupabaseClient {
  const local = localSupabaseConfig()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? local.apiUrl
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? local.serviceRoleKey
  if (!url || !serviceKey) {
    throw new Error(
      "Collaboration requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    )
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const admin = getAdminClient()

function allowedOrigins(): Set<string> {
  const configured = [
    process.env.HOCUSPOCUS_ALLOWED_ORIGINS,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .filter(Boolean)
    .flatMap((value) => value!.split(","))
    .map((value) => value.trim())
    .filter(Boolean)

  if (process.env.NODE_ENV !== "production") {
    configured.push("http://localhost:3000", "http://127.0.0.1:3000")
  }
  if (process.env.NODE_ENV === "production" && configured.length === 0) {
    throw new Error(
      "Set HOCUSPOCUS_ALLOWED_ORIGINS or NEXT_PUBLIC_APP_URL in production"
    )
  }
  return new Set(configured)
}

const origins = allowedOrigins()

function assertDocumentId(documentName: string): void {
  if (!documentIdPattern.test(documentName)) {
    throw new Error("Invalid document room")
  }
}

function assertOrigin(origin: string | undefined): void {
  if (!origin || !origins.has(origin)) throw new Error("Origin not allowed")
}

function tokenExpiration(token: string): number | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8")
    ) as { exp?: number }
    return typeof payload.exp === "number" ? payload.exp * 1_000 : null
  } catch {
    return null
  }
}

function userDisplayName(user: User): string {
  const metadata = user.user_metadata ?? {}
  return (
    metadata.full_name ??
    metadata.name ??
    user.email?.split("@")[0] ??
    "Collaborator"
  )
}

async function authenticate(token: string): Promise<User> {
  if (!token) throw new Error("Authentication required")
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new Error("Invalid collaboration token")
  return data.user
}

async function documentRole(
  documentId: string,
  userId: string
): Promise<DocumentRole | null> {
  const { data: document, error: documentError } = await admin
    .from("documents")
    .select("user_id")
    .eq("id", documentId)
    .maybeSingle()
  if (documentError) throw new Error("Unable to authorize document")
  if (!document) return null
  if (document.user_id === userId) return "owner"

  const { data: permission, error: permissionError } = await admin
    .from("document_permissions")
    .select("role")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle()
  if (permissionError) throw new Error("Unable to authorize document")
  return (permission?.role as DocumentRole | undefined) ?? null
}

async function collaborationContext(
  token: string,
  documentId: string
): Promise<CollaborationContext> {
  assertDocumentId(documentId)
  const user = await authenticate(token)
  const role = await documentRole(documentId, user.id)
  if (!role) throw new Error("Document access denied")
  return {
    userId: user.id,
    email: user.email ?? "",
    name: userDisplayName(user),
    role,
    tokenExpiresAt: tokenExpiration(token),
    lastAuthorizationCheck: Date.now(),
  }
}

export const collaborationServer = new Server({
  port,
  debounce: 1_000,
  maxDebounce: 10_000,
  unloadImmediately: false,

  async onConnect({ documentName, requestHeaders }) {
    assertDocumentId(documentName)
    assertOrigin(requestHeaders.origin)
  },

  async onAuthenticate({ token, documentName, connectionConfig }) {
    const context = await collaborationContext(token, documentName)
    connectionConfig.readOnly = context.role === "viewer"
    return context
  },

  async onTokenSync({ token, documentName, connection }) {
    const context = await collaborationContext(token, documentName)
    connection.readOnly = context.role === "viewer"
    return context
  },

  async beforeHandleMessage({ context, documentName, connection }) {
    const collaboration = context as CollaborationContext | undefined
    if (
      collaboration?.tokenExpiresAt &&
      collaboration.tokenExpiresAt <= Date.now()
    ) {
      throw new Error("Collaboration token expired")
    }
    if (
      collaboration &&
      Date.now() - collaboration.lastAuthorizationCheck > 10_000
    ) {
      const role = await documentRole(documentName, collaboration.userId)
      if (!role) throw new Error("Document access revoked")
      collaboration.role = role
      collaboration.lastAuthorizationCheck = Date.now()
      connection.readOnly = role === "viewer"
    }
  },

  async onLoadDocument({ document, documentName }) {
    const { data, error } = await admin
      .from("documents")
      .select("yjs_state")
      .eq("id", documentName)
      .maybeSingle()
    if (error) throw new Error(`Unable to load collaboration state: ${error.message}`)
    if (!data) throw new Error("Document not found")
    if (data.yjs_state) {
      Y.applyUpdate(
        document,
        new Uint8Array(Buffer.from(data.yjs_state, "base64"))
      )
    }
  },

  async onStoreDocument({ document, documentName }) {
    const state = Buffer.from(Y.encodeStateAsUpdate(document)).toString("base64")
    const { error } = await admin
      .from("documents")
      .update({ yjs_state: state })
      .eq("id", documentName)
    if (error) throw new Error(`Unable to store collaboration state: ${error.message}`)
  },

  async onRequest({ request, response }) {
    if (request.url !== "/health") return
    response.writeHead(200, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ ok: true }))
    throw new Error("health-response-complete")
  },

  async onListen({ port: listeningPort }) {
    console.log(`Collaboration server listening on ws://localhost:${listeningPort}`)
  },
})

collaborationServer.listen()