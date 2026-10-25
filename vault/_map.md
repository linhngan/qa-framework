# Vault map

Project notes kept next to the code. Only scripts/vault-sync.mjs writes to `_changelog/`.

- `_raw/` — unprocessed inputs. Empty for now; `.gitkeep` keeps the folder in Git.
- `_changelog/` — written by scripts/vault-sync.mjs:
  - `YYYY-MM-DD.md` — one line per Claude Code Edit or Write call on a project file outside `vault/`, named by local date. Not ignored by Git, so it is committed with the work.
  - `sessions.log` — one line per session start. Ignored by Git (`*.log` in .gitignore).
- `03-framework/` — how the framework works, e.g. [hook-lifecycle-map.md](03-framework/hook-lifecycle-map.md).
