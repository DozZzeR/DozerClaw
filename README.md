# DozerClaw

Family-oriented operational assistant controlled through a messenger (Telegram first).
It provides family memory (facts + semantic notes), document handling, planning access,
and server/service monitoring. It is designed to stay useful even when no model-backed
reasoning is available.

Product truth lives in `../docs/spec/`. Read the relevant spec files before changing code.

## Architecture

Hexagonal (ports & adapters):

- `src/core/domain` — domain types, no I/O.
- `src/application/use-cases` — application logic, depends only on `src/ports`.
- `src/ports` — port interfaces.
- `src/infrastructure/providers` — adapters implementing ports (Telegram, SQLite, Google
  Drive, MemPalace, Singularity planning, Codex model, local monitors).
- `src/composition` — config loading and the composition root (`build-app.ts`).
- `src/entrypoints` — Telegram runtime and dev CLI commands.

## Requirements

- Node.js >= 22 (see `.nvmrc`). The bot runs on Node 22 in production (PM2).
  Older Node breaks `better-sqlite3` under the vitest worker pool.

## Setup

```bash
nvm use            # picks up .nvmrc (22)
npm ci
cp .env.example .env   # then fill in secrets
```

## Common scripts

```bash
npm run dev            # run the bot with tsx
npm run dev:telegram   # run the Telegram entrypoint
npm run typecheck      # tsc --noEmit
npm test               # vitest run
npm run build          # compile to dist/
npm start              # run compiled dist/main.js
```

Dev/maintenance CLIs (each reads `.env`): `dev:health`, `dev:register-services`,
`dev:google-oauth`, `dev:google-drive-smoke`, `dev:mempalace-smoke`, `dev:store-file`,
`dev:subject-alias`, `dev:list-subject-aliases`, `dev:repair-documents`,
`dev:pending-routing-events`, `dev:codex-smoke`. See `package.json` for the full list.

## Configuration

All configuration is via environment variables (see `.env.example`). Groups:

- Runtime: `NODE_ENV`, `DOZERCLAW_TIME_ZONE`.
- Storage: `DOZERCLAW_DB_PATH`, `DOZERCLAW_FILE_STORAGE_ROOT`.
- Telegram: `DOZERCLAW_TELEGRAM_BOT_TOKEN`, `DOZERCLAW_TELEGRAM_OWNER_USER_ID`, timeouts.
- Model (Codex): `DOZERCLAW_MODEL_ROUTING_ENABLED`, `DOZERCLAW_CODEX_*`.
- Memory (MemPalace): `DOZERCLAW_MEMPALACE_*`.
- Planning (Singularity): `DOZERCLAW_SINGULARITY_*`.
- Documents (Google Drive): `DOZERCLAW_GOOGLE_OAUTH_*`, `DOZERCLAW_GOOGLE_DRIVE_*`,
  `DOZERCLAW_DRIVE_FOLDER_MAP_JSON`.
- Service health: `DOZERCLAW_SERVICE_HEALTH_TIMEOUT_MS`, `*_HEALTH_URL`.

Never commit `.env`. Only `.env.example` is tracked.

## Access model

- `owner` — administrative authority; state-mutating system actions require admin mode.
- `family` — normal family-facing features in approved private chats and approved groups.
