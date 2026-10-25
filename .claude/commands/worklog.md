---
description: Append a timestamped entry to today's progress journal
---
Add one entry to today's progress journal.

1. Run `node "${CLAUDE_PROJECT_DIR}"/scripts/hooks/stop-worklog.mjs --path` to get the journal path. Use exactly that path.
2. Run `date +%H:%M` to get the real local time. Never guess or reuse a time.
3. If the file exists, read it and append the new entry at the end. Do not change or remove earlier entries. If it does not exist, create it with `# <YYYY-MM-DD>` (the date in the path), a blank line, then the entry.
4. Use this format, with each bullet one or two short sentences:

   ```
   ## HH:MM
   - **Did:** what was done in this session
   - **Worked / didn't:** what passed, what failed or is still unverified
   - **Next:** the next concrete step
   ```

   Base it on this session plus `git status --short` and `git log -3 --oneline`.
5. Never include secrets: no tokens, keys, passwords, `.env` contents or login state. Name files and outcomes only.
