# Loop

Loop is a personal workspace for managing a Google calendar and inbox with an
AI assistant. It combines calendar planning, Gmail threads and attachments,
public booking links, and read-only calendar sharing.

## Local development

Prerequisites: Bun, Docker, and the Supabase CLI.

```bash
bun install
cp .env.example .env.local
bun run dev:up
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). Configure Google OAuth,
OpenAI, Redis, and encryption values in `.env.local` as described in
`.env.example`.

## Checks

```bash
bun run typecheck
bun run lint
bun run build
```
