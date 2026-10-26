# Jira seed pack — set up the course backlog

This package imports the course's sample work items into your own Jira: **7 epics, 30 tasks, and 121 test-case subtasks**. After a successful import, you can read the same requirements used in the lessons and prepare your framework for later Jira work.

Download `jira-seed.zip` from the Downloads section of the Week 2 lesson **Set up your Jira board and API access**. Follow that lesson for the complete setup.

## What is included

| File | Purpose |
|---|---|
| `jira-seed/jira-seed.json` | Source backlog, including course keys, summaries, descriptions, parents, labels, and test-case IDs |
| `jira-seed/jira-seed.schema.json` | Schema used to describe the backlog file's structure |
| `jira-seed/jira-seed.md` | Generated, readable copy of the backlog |
| `jira-seed/fixtures/*.json` | Pretend Jira spaces for offline simulations |
| `scripts/jira-seed.mjs` | Import script; requires Node.js 20 or later, with no extra dependencies |

Extract the package into the root of your framework. You should have `jira-seed/jira-seed.json` and `scripts/jira-seed.mjs` at those exact paths, alongside your existing `package.json`. Avoid an extra outer folder.

## Before the real import

1. Create a personal Jira site and an empty **team-managed Scrum space with key `SCRUM`**. Keep it free of sample work items.
2. Create an **expiring, non-scoped Atlassian API token** for that account. The current script uses your site's address with email/token authentication. A scoped token requires a different API address and is not supported by this setup.
3. Add the following to the framework's root `.env` yourself, preserving existing settings:

```text
JIRA_BASE_URL=https://<your-site>.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=<your token>
JIRA_URL=${JIRA_BASE_URL}
JIRA_USERNAME=${JIRA_EMAIL}
```

There are **three values to obtain and five lines to save**. The last two are aliases expected by the Week 3 Jira MCP connector. This package verifies API access; it does not install or connect that MCP.

Keep `.env` ignored and untracked. `git check-ignore .env` should print the filename; `git ls-files .env` should print nothing. Never paste the token into AI chat, evidence, screenshots, or commits.

## Preview, import, and verify

From your framework root:

```bash
node scripts/jira-seed.mjs --dry-run
```

The dry run is **offline**. It uses a simulated space, does not read your real Jira, and does not validate credentials. Its simulated “Checking access” output is not proof of a working connection.

When your personal space and credentials are ready:

```bash
node scripts/jira-seed.mjs
```

The real run signs in, checks access and work types, reads existing items, and imports the backlog. Allow a few minutes. An empty space should finish with:

```text
ok: all 158 keys match the course (SCRUM-5..SCRUM-162)
```

Open the final link printed by the script. The item should be **Automate environment & navigation smoke (UI)**, usually `SCRUM-9`, with its three `TC-UI-` subtasks. Save the success output or a screenshot without credentials. Commit the package and any generated key map, never `.env`.

## Why temporary placeholders are created

The course's work-item numbers begin at `SCRUM-5`. On a fresh space, the script first creates four placeholders and deletes those placeholders, then imports the backlog in key order. It does this because Jira does not reuse deleted numbers.

The script may need fewer placeholders if lower-numbered items already exist. `--keep-placeholders` retains the placeholders created by that run.

If existing work or previously used numbers cause different keys, the script writes `vault/sources/jira/key-map.md`. Use that file to translate course keys into your board's keys. Do not delete your work to force matching numbers.

## If an import is interrupted

Fix the reported cause and rerun the same script. It reuses work items whose summaries match the seed summaries. Avoid renaming imported items before a retry; changed summaries can prevent matching. If you changed a parent or summary, ask your mentor before rerunning.

For authentication errors, check the site address, account email, non-scoped token, and expiry locally. For space errors, check `SCRUM`, access rights, and the Epic, Task, and Subtask work types. Share error messages without credential values.

## Optional offline practice

```bash
node scripts/jira-seed.mjs --dry-run --fixture jira-seed/fixtures/empty.json
node scripts/jira-seed.mjs --dry-run --fixture jira-seed/fixtures/sample-items.json
node scripts/jira-seed.mjs --dry-run --fixture jira-seed/fixtures/already-seeded.json
node scripts/jira-seed.mjs --dry-run --fixture jira-seed/fixtures/drift.json
```

Each fixture is a pretend space. Read its description and compare the predicted behavior with the simulation's output. These runs require no token and make no Jira changes.

## Options

```text
--seed <path>         backlog file (default jira-seed/jira-seed.json)
--env <path>          credentials file (default .env)
--project <KEY>       space key (default SCRUM)
--fixture <path>      dry-run only: pretend the space has these work items
--keep-placeholders   retain the numbering placeholders created by this run
--key-map <path>      key map path (default vault/sources/jira/key-map.md)
--emit-md <path>      regenerate the readable backlog from JSON and exit
```

## Script behavior and source

The script uses Jira REST v3 and Basic authentication over HTTPS with `JIRA_EMAIL:JIRA_API_TOKEN`. It sends requests sequentially and retries rate-limit responses. It does not print the token or update existing items' status/comments. Its only deletion operation is for the temporary placeholders created during that run.

The backlog is a snapshot of the course reference space taken on 2026-09-16. The descriptions for `SCRUM-8` and `SCRUM-24` were corrected to remove a tool no longer used by the course. The readable backlog is generated from the JSON; edit the source JSON only when maintaining the package.
