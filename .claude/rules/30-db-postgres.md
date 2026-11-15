# Database checks (postgres MCP)

DRAFT, Week 3 T01. Not yet verified: no database request has run from this project. Items marked UNVERIFIED are assumptions until a reviewed run records them. ⚠️ marks a mistake that our current checks would not catch. Extends D7 in .claude/rules/20-data-management.md; G1–G8 in .claude/rules/01-guardrails.md still apply.

## DB1. Connection and credentials
- Do: use only the `postgres` server in `.mcp.json`: `uvx --env-file ${CLAUDE_PROJECT_DIR:-.}/.env --python 3.12 --with mcp~=1.0 --overrides ${CLAUDE_PROJECT_DIR:-.}/uv-overrides.txt postgres-mcp --access-mode=restricted`.
- The connector reads `DATABASE_URI` itself from the environment that uv loads from `.env`. `.mcp.json` has no `env` block and no URI, host, user or password, and never gets one.
- Never read or print `.env`, `DATABASE_URI` or any part of it (G5). Record connection errors redacted.
- The server stays off until a person approves it in Claude Code (project MCP approval, stored in the untracked `.claude/settings.local.json`). Never pre-approve it by editing settings, and never set `enableAllProjectMcpServers`.
- Check: review of `.mcp.json` and the transcript.
- ⚠️ The guard and the pre-commit scan do not recognize a `postgresql://user:password@…` URI. A pasted connection string in a tracked file passes both.

## DB2. Keep three layers apart
Never treat one layer as proof of another.
- Connector restrictions (source: postgres-mcp 0.3.0 code in the local uv cache, `server.py`, `sql/safe_sql.py`, `sql/sql_driver.py`, read 2026-11-16; not observed against a database): in restricted mode every statement is parsed by pglast and only allowed statement types, functions and extensions pass; each query runs in `BEGIN TRANSACTION READ ONLY` and is rolled back; a 30-second client-side timeout applies.
- Database permissions: what the role is actually granted. Expected rights come only from the mentor-issued permission matrix. Observed rights are findings, never the definition of what is allowed.
- UNVERIFIED behavior:
  - The parser accepts `CREATE EXTENSION`, `VACUUM`, `ANALYZE` and `PREPARE`. Whether the read-only transaction blocks each one is assumed, not observed.
  - The client-side timeout may not cancel the query on the server.
  - pglast 7.21 resolves with postgres-mcp 0.3.0 on Python 3.12, but its SQL parsing with this connector is untested.
  - Whether `${CLAUDE_PROJECT_DIR}` is set when `.mcp.json` is expanded; without it the `.` fallback depends on the working directory.
  - Whether an inherited `DATABASE_URI` takes precedence over the value in `.env`.
  - `postgres-mcp` is not version-pinned: each start resolves it from PyPI and may pick up a newer release.
  - Row-level security may filter counts.

## DB3. Allowed reads
- Do: read-only `SELECT` through `execute_sql`, and the `list_schemas`, `list_objects` and `get_object_details` tools, limited to:
  - identity: `current_user`, `session_user`, `now()`;
  - catalog metadata: schema and table names from `pg_catalog`, filtered to the approved schemas;
  - aggregate counts with a timestamp, for example `SELECT count(*) AS user_count, now() AS counted_at FROM <approved table>;`;
  - role attributes, memberships, ownership and effective grants (DB5).
- Approved tables (DB5 matrix): blog `articles`, `categories`, `comments`; store `products`, `product_variants`, `coupons`, `carts`, `cart_items`, `orders`, `order_items`, `payments`; and `users`. Schema: not stated in the matrix; confirm it from catalog names on the first run, never by guessing.
- Record a count with its date and time only. Never assert it against a fixed or historical number.
- Check: review every query before it runs.

## DB4. Forbidden
- Personal rows: no `SELECT *` on user tables, and no emails, names or other personal columns, even in a single row.
- Mutation or "can I write?" probes, DDL, `CREATE EXTENSION`, `VACUUM`, `ANALYZE`, `EXPLAIN ANALYZE`, `PREPARE`.
- The tools `analyze_workload_indexes`, `analyze_query_indexes`, `analyze_db_health` and `get_top_queries`: they create extensions, read statistics, or expose other users' query text.
- `--access-mode=unrestricted`, or any change to the server arguments without review.
- Check: review of the transcript.
- ⚠️ Restricted mode allows some of these at the parser level (DB2). Only review stops them.

## DB5. Permission audit against the mentor's matrix
- Do: compare observed rights with the matrix, item by item, in an expected-vs-observed table:
  - role attributes from `pg_roles` for `current_user` (superuser, create role, create database, login, replication, bypass RLS, connection limit, `rolconfig`);
  - memberships from `pg_auth_members`, and inherited membership with `pg_has_role`;
  - ownership: objects (`pg_class.relowner`), schemas (`pg_namespace.nspowner`) and the database (`pg_database.datdba`) owned by `current_user`;
  - effective grants: `has_database_privilege` (CONNECT, CREATE, TEMP), `has_schema_privilege` (USAGE, CREATE), `has_table_privilege` (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) and `has_sequence_privilege`, including grants to PUBLIC.
- If the matrix is missing or unclear, stop and ask the mentor. If a Jira ticket says something different, the matrix wins (mentor's instruction). Report a mismatch; never "fix" it.
- Mentor-issued permission matrix (source: mentor's list as pasted by Ngan Nguyen, recorded 2026-11-16; for Week 3 Task 01 and Task 07). Expected rights, translated to PostgreSQL privileges:

  | Object | Expected | Expected denied |
  |---|---|---|
  | Group role | login role is a member of `qa_student` | — |
  | Blog tables `articles`, `categories`, `comments` | SELECT, INSERT, UPDATE, DELETE | TRUNCATE |
  | Store tables `products`, `product_variants`, `coupons`, `carts`, `cart_items`, `orders`, `order_items`, `payments` | SELECT, INSERT, UPDATE, DELETE | TRUNCATE |
  | `users` | SELECT, INSERT | UPDATE, DELETE, TRUNCATE |
  | Sequences (ID counters) | usable (USAGE) | — |
  | Table structure | nothing: owns no table, schema or database; no CREATE on the schema | ALTER, DROP, CREATE |
  | Logins and roles | nothing | CREATEROLE |
  | Superuser | nothing | SUPERUSER |

  Not stated in the matrix (record as observed, never as a mismatch): schema name, CREATEDB, REPLICATION, BYPASSRLS, connection limit, REFERENCES, TRIGGER, sequence SELECT/UPDATE, database TEMP.
- ⚠️ The role is expected to hold INSERT, UPDATE and DELETE. The database will not stop a write by Claude; only restricted mode (DB2) and review (DB4, DB6) do.
- Check: review of the audit table.

## DB6. Approval
- Do: describe the exact queries and get human approval before every database session, including read-only ones. Any change to the database is out of scope (G1, G4).
- Check: review of the transcript.

## DB7. Recorded deviation: pglast override
- `uv-overrides.txt` (project root) replaces the `pglast==7.2.0` pin in postgres-mcp 0.3.0 with `pglast==7.21`.
- Reason: postgres-mcp pins pglast 7.2.0, which PyPI no longer serves (as reported; not checked from this project). An offline run showed only that 7.2.0 is not in the local cache.
- Remove `uv-overrides.txt` and its `--overrides` arguments once a fixed connector release is published. Check for one each week.
- Check: review.

## DB8. Access results record
- Status on 2026-11-16: NO DATABASE CHECK HAS RUN. The `postgres` tools were not loaded in the session that wrote this rule, and `.claude/settings.local.json` approves only `playwright`. Nothing below marked Observed or Actual is a result.
- Expected access facts: recorded in DB5 (matrix, 2026-11-16).
- Observed access facts (role, attributes, memberships, ownership, grants): PENDING a reviewed run. Record them in an expected-vs-observed table next to DB5.
- Actual results (`current_user`, approved schema and table names, user count with date and time): PENDING. Record each value with its source (tool and query) and date. No private rows and no credentials.
- Denied operation (guided practice): UPDATE on `users`. Expected: `has_table_privilege(current_user, '<schema>.users', 'UPDATE')` returns false, which means the role has not been granted the right to change existing user rows. Observed: PENDING. This is a metadata read only; never attempt the UPDATE, and never claim it was blocked when nothing was attempted.
- Limitations:
  - Metadata shows what the role is granted, not what the application allows.
  - Row-level security can hide rows from counts.
  - Restricted mode adds its own refusals (DB2). Record which layer refused a read: the connector (validation error), PostgreSQL (permission error) or the client (timeout).
- Repeatable scripts for these checks belong to Task 7. This rule records one-off reviewed results only.
- Check: review. Each result needs a date and a source.
