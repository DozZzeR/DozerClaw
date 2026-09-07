# Ops health checks

External health checks for the DozerClaw bot that push to [ntfy](https://ntfy.sh)
**only on status transitions** (OK↔FAIL), so a healthy bot stays quiet.

They run outside the bot process (via cron) so a crashed bot is still detected.

## Scripts

- `healthcheck-liveness.sh` — the pm2 `dozerclaw` process is online, and the
  Telegram bot answers `getMe`. Cheap; run frequently.
- `healthcheck-model.sh` — the Codex model provider answers a smoke test
  (expects `DOZERCLAW_CODEX_SMOKE_OK`). Expensive/slow; run infrequently.
- `lib.sh` — shared ntfy notify + transition-only alert logic. Sourced by both.

State is kept in `state/*.status` (gitignored) so alerts fire only on change.
Both scripts set `PATH` to the bot's runtime (`~/.local/bin`,
`~/.local/node-v22.22.2/bin`) so `node`, `npm`, `pm2` and `codex` resolve under cron.

## Setup on a fresh server

```bash
cd ~/DozerClawProject/repo/ops
cp notify.env.example notify.env
chmod 600 notify.env
# edit notify.env: set NTFY_URL (and NTFY_TOKEN if the topic is private)

# install cron
( crontab -l 2>/dev/null | grep -v 'DozerClawProject/repo/ops/healthcheck'
  echo '*/15 * * * * '"$PWD"'/healthcheck-liveness.sh >> '"$PWD"'/state/cron.log 2>&1'
  echo '0 */6 * * * '"$PWD"'/healthcheck-model.sh >> '"$PWD"'/state/cron.log 2>&1'
) | crontab -
```

## Test delivery

```bash
cd ~/DozerClawProject/repo/ops
bash -c '. ./lib.sh; notify "DozerClaw: test" "wired up" default "white_check_mark,dozerclaw"'
```

`notify.env` (the ntfy token) and `state/` are gitignored — never committed.
