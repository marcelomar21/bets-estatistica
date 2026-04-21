# launchd references for GuruBet one-off jobs

Reference copies of the user-level LaunchAgents that schedule the mass
eviction of GuruBet ghost members on 2026-05-01. The authoritative copies
live on the operator's Mac under `~/Library/LaunchAgents/` — these files
are kept in the repo so the schedule survives a machine reinstall or a
hand-off to a different operator.

## Files

| Plist | When | Args |
|---|---|---|
| `com.gurubet.evict-ghost-dry.plist` | 2026-05-01 14:00 BRT (17:00 UTC) | `--dry-run --notify-admin` |
| `com.gurubet.evict-ghost-apply.plist` | 2026-05-01 15:00 BRT (18:00 UTC) | `--apply --notify-admin` |

Both call `bash scripts/run-evict-ghost.sh <args>`. See that wrapper for
env var injection and the 2026-only year guard that prevents re-firing
in future years.

## Install on a new Mac

The plists hard-code the absolute path
`/Users/wehandle/Projetos/pessoal/bets-estatistica`. Edit that path if
the repo lives elsewhere, then:

```bash
cp scripts/launchd/com.gurubet.evict-ghost-*.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.gurubet.evict-ghost-dry.plist
launchctl load ~/Library/LaunchAgents/com.gurubet.evict-ghost-apply.plist
launchctl list | grep gurubet  # both should show LastExitStatus=0
```

## Cancel

```bash
launchctl unload ~/Library/LaunchAgents/com.gurubet.evict-ghost-apply.plist
# Optionally run dry-run manually afterwards:
bash scripts/run-evict-ghost.sh --dry-run --notify-admin
```

## Logs

- stdout: `/tmp/evict-ghost-{dry,apply}.log`
- stderr: `/tmp/evict-ghost-{dry,apply}.err`
