# Loop

Loop is a personal workspace for managing a Google calendar, inbox, and
documents with an AI assistant. It combines calendar planning, Gmail threads
and attachments, public booking links, read-only calendar sharing, and a rich
document workspace.

The document workspace at `/documents` includes folders, starter templates,
grid and list views, a Plate-based page editor, Markdown import/export, code
blocks, lists, links, equations, line numbers, autoformat controls, autosave,
and an approval-gated Loop Writer for drafting, revising, and organizing files.

## Local development

Prerequisites: Bun, Docker, and the Supabase CLI.

```bash
bun install
cp .env.example .env.local
bun run dev:up
bun run dev:all
```

Open [http://localhost:3000](http://localhost:3000). Configure Google OAuth,
OpenAI, Redis, and encryption values in `.env.local` as described in
`.env.example`. `dev:all` runs Next.js and the authenticated Hocuspocus
collaboration server together. To run them separately, use `bun run dev` and
`bun run dev:collab`.

In production, deploy the web app and collaboration process together with the
same Supabase project. Start the latter with `bun run start:collab`, set
`SUPABASE_SERVICE_ROLE_KEY` only on that server, and point
`NEXT_PUBLIC_HOCUSPOCUS_URL` at its public `wss://` endpoint.

## Checks

```bash
bun run typecheck
bun run lint
bun run build
```
