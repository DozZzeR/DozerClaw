# Entrypoints

Entrypoints parse transport-specific input, call application use cases, and format transport-specific output.

Planned entrypoints:

- Telegram bot runtime
- CLI diagnostics and maintenance commands

Entrypoints should not own business rules or persistence queries.

Current dev-only CLI harnesses:

- `dev:health` exercises the normalized message path for system health.
- `dev:codex-smoke` checks the configured Codex model provider.
- `dev:google-oauth` prints a Drive OAuth consent URL or exchanges an
  authorization code for a refresh token.
- `dev:mempalace-smoke` checks family fact record/recall through configured
  SQLite and MemPalace.
- `dev:google-drive-smoke` checks service-account Drive upload and confirmed
  placement through the normalized message path.
