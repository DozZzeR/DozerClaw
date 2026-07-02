# Entrypoints

Entrypoints parse transport-specific input, call application use cases, and format transport-specific output.

Planned entrypoints:

- Telegram bot runtime
- CLI diagnostics and maintenance commands

Entrypoints should not own business rules or persistence queries.
