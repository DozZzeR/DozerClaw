# Providers

Provider implementations live here and adapt external systems to ports from `src/ports`.

Planned v1 providers:

- Telegram messenger
- SQLite state repository and event log
- local host monitor
- named service monitor
- active model provider
- MemPalace family memory
- Google Drive document storage
- Singularity planning

Providers must not contain application use-case decisions. They translate external APIs into port contracts.
