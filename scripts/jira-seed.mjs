#!/usr/bin/env node
/**
 * jira-seed.mjs — put the course backlog into YOUR Jira.
 *
 * You created a free Atlassian site and a team-managed Scrum space with key
 * SCRUM (Week 2, lesson "Your Jira"). This script fills it with the same
 * epics, tasks and TC-* case sub-tasks the course material refers to, in the
 * same order, so SCRUM-9 in your Jira is the SCRUM-9 the lessons talk about.
 *
 *   node scripts/jira-seed.mjs --dry-run      plan only — no network, no .env needed
 *   node scripts/jira-seed.mjs                create for real (reads .env)
 *
 * Options
 *   --seed <path>          the backlog file        (default jira-seed/jira-seed.json)
 *   --env <path>           the credentials file    (default .env)
 *   --project <KEY>        the space key           (default SCRUM)
 *   --fixture <path>       dry-run only: simulate a project that already has work items
 *   --keep-placeholders    do not delete the four numbering placeholders
 *   --key-map <path>       where a key map is written on drift (default vault/sources/jira/key-map.md)
 *   --emit-md <path>       write the human-readable view of the seed and exit
 *
 * Zero dependencies. Node 20 or newer. The token is read from .env and never printed.
 *
 * How numbering works. Jira gives every new work item the next number and never
 * reuses one. The source project had SCRUM-1..4 deleted, so the course keys start
 * at SCRUM-5. On an empty space this script creates four placeholders, deletes
 * them, then creates the real backlog — your keys come out identical to the
 * course's. If your space already had work items, keys shift; the script then
 * writes a key map (course key → your key) and prints it.
 *
 * Idempotent by summary: a work item whose summary already exists is reused,
 * never duplicated. Re-running after a failure is safe.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const o = {
    dryRun: false,
    seed: "jira-seed/jira-seed.json",
    env: ".env",
    project: "SCRUM",
    fixture: null,
    keepPlaceholders: false,
    keyMap: "vault/sources/jira/key-map.md",
    emitMd: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) die(`${a} needs a value`);
      return argv[++i];
    };
    switch (a) {
      case "--dry-run":
        o.dryRun = true;
        break;
      case "--seed":
        o.seed = next();
        break;
      case "--env":
        o.env = next();
        break;
      case "--project":
        o.project = next().toUpperCase();
        break;
      case "--fixture":
        o.fixture = next();
        break;
      case "--keep-placeholders":
        o.keepPlaceholders = true;
        break;
      case "--key-map":
        o.keyMap = next();
        break;
      case "--emit-md":
        o.emitMd = next();
        break;
      case "-h":
      case "--help":
        console.log(
          readFileSync(new URL(import.meta.url), "utf8")
            .split("*/")[0]
            .replace(/^#!.*\n/, "")
            .replace(/^\/\*\*?\n?/, "")
            .replace(/^ \* ?/gm, ""),
        );
        process.exit(0);
        break;
      default:
        die(`unknown option: ${a} (try --help)`);
    }
  }
  if (o.fixture && !o.dryRun) die("--fixture only makes sense with --dry-run");
  return o;
}

function die(msg) {
  console.error(`\nerror: ${msg}`);
  process.exit(1);
}

const log = (...a) => console.log(...a);
const step = (s) => console.log(`\n== ${s}`);

// ---------------------------------------------------------------------------
// .env — tiny reader, no dependency. KEY=VALUE, quotes optional, # comments,
// ${OTHER} expands from the file first and the process environment second.
// ---------------------------------------------------------------------------
function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line
      .slice(0, eq)
      .trim()
      .replace(/^export\s+/, "");
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  for (const k of Object.keys(out)) {
    out[k] = out[k].replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, n) => out[n] ?? process.env[n] ?? "");
  }
  return out;
}

function credentials(envPath) {
  const file = loadEnvFile(envPath);
  const get = (k) => process.env[k] || file[k] || "";
  const baseUrl = get("JIRA_BASE_URL").replace(/\/+$/, "");
  const email = get("JIRA_EMAIL");
  const token = get("JIRA_API_TOKEN");
  const missing = [
    ["JIRA_BASE_URL", baseUrl],
    ["JIRA_EMAIL", email],
    ["JIRA_API_TOKEN", token],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    die(
      `missing ${missing.join(", ")} — put them in ${envPath} (see .env.example). ` +
        `Type them yourself; never paste a token into a chat or a commit.`,
    );
  }
  if (!/^https:\/\/[a-z0-9-]+\.atlassian\.net$/i.test(baseUrl)) {
    console.warn(`warning: JIRA_BASE_URL "${baseUrl}" does not look like https://<site>.atlassian.net`);
  }
  return { baseUrl, email, token };
}

// ---------------------------------------------------------------------------
// Seed file — load, validate, flatten into creation order
// ---------------------------------------------------------------------------
const PRIORITIES = new Set(["Highest", "High", "Medium", "Low", "Lowest"]);
const keyNum = (k) => Number(String(k).split("-")[1]);

function loadSeed(path) {
  if (!existsSync(path)) die(`seed file not found: ${path}`);
  let seed;
  try {
    seed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    die(`seed file is not valid JSON: ${e.message}`);
  }
  const issues = [];
  const problems = [];
  const seen = new Set();

  const check = (item, type, parentCourseKey) => {
    const where = `${type} ${item.courseKey || "(no courseKey)"}`;
    if (!/^[A-Z][A-Z0-9]+-\d+$/.test(item.courseKey || ""))
      problems.push(`${where}: courseKey must look like SCRUM-12`);
    if (seen.has(item.courseKey)) problems.push(`${where}: duplicate courseKey`);
    seen.add(item.courseKey);
    if (typeof item.summary !== "string" || !item.summary.trim()) problems.push(`${where}: summary is required`);
    if (item.summary && item.summary.length > 255) problems.push(`${where}: summary longer than 255 characters`);
    if (item.description != null && typeof item.description !== "string")
      problems.push(`${where}: description must be a string`);
    if (item.labels && !Array.isArray(item.labels)) problems.push(`${where}: labels must be an array`);
    for (const l of item.labels || [])
      if (!/^[A-Za-z0-9_.-]+$/.test(l)) problems.push(`${where}: label "${l}" has spaces or odd characters`);
    if (item.priority && !PRIORITIES.has(item.priority))
      problems.push(`${where}: priority "${item.priority}" is not a Jira default`);
    if (parentCourseKey && keyNum(parentCourseKey) >= keyNum(item.courseKey)) {
      problems.push(`${where}: parent ${parentCourseKey} must have a lower number (creation order)`);
    }
    issues.push({
      courseKey: item.courseKey,
      num: keyNum(item.courseKey),
      type,
      summary: item.summary.trim(),
      description: item.description || "",
      labels: item.labels || [],
      priority: item.priority || null,
      parentCourseKey: parentCourseKey || null,
      tc: item.tc || null,
    });
  };

  if (!Array.isArray(seed.epics) || !seed.epics.length) die("seed has no epics[]");
  for (const epic of seed.epics) {
    check(epic, "Epic", null);
    for (const task of epic.tasks || []) {
      check(task, "Task", epic.courseKey);
      for (const sub of task.subtasks || []) check(sub, "Subtask", task.courseKey);
    }
  }
  if (problems.length) {
    console.error(`seed file failed validation (${problems.length} problem(s)):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  issues.sort((a, b) => a.num - b.num);
  return { seed, issues };
}

// ---------------------------------------------------------------------------
// Description text → Atlassian Document Format (what REST v3 requires).
// Supports: paragraphs, "* " / "- " bullet lines, **bold**.
// ---------------------------------------------------------------------------
function inline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) });
    out.push({ type: "text", text: m[1], marks: [{ type: "strong" }] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out.length ? out : [{ type: "text", text: " " }];
}

function toAdf(text) {
  const blocks = [];
  let list = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (list) {
        blocks.push(list);
        list = null;
      }
      continue;
    }
    const bullet = line.match(/^\s*[*-]\s+(.*)$/);
    if (bullet) {
      if (!list) list = { type: "bulletList", content: [] };
      list.content.push({ type: "listItem", content: [{ type: "paragraph", content: inline(bullet[1]) }] });
    } else {
      if (list) {
        blocks.push(list);
        list = null;
      }
      blocks.push({ type: "paragraph", content: inline(line.trim()) });
    }
  }
  if (list) blocks.push(list);
  return blocks.length ? { type: "doc", version: 1, content: blocks } : null;
}

// ---------------------------------------------------------------------------
// Backends — the live REST client, and a simulator for --dry-run
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class LiveJira {
  constructor({ baseUrl, email, token }) {
    this.base = baseUrl;
    this.auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
    this.calls = 0;
  }

  async request(method, path, body) {
    const url = `${this.base}${path}`;
    let attempt = 0;
    for (;;) {
      attempt++;
      this.calls++;
      let res;
      try {
        res = await fetch(url, {
          method,
          headers: { Authorization: this.auth, Accept: "application/json", "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        if (attempt >= 5) throw new Error(`network error calling ${method} ${path}: ${e.message}`);
        await sleep(backoff(attempt));
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= 5) throw new Error(`${method} ${path} kept failing (${res.status}) after ${attempt} attempts`);
        const retryAfter = Number(res.headers.get("retry-after")) || 0;
        const wait = Math.max(retryAfter * 1000, backoff(attempt));
        console.warn(`   ${res.status} from Jira — waiting ${Math.round(wait / 1000)} s (attempt ${attempt})`);
        await sleep(wait);
        continue;
      }
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const err = new Error(
          `${method} ${path} → ${res.status}: ${(json && summarizeJiraError(json)) || text.slice(0, 300)}`,
        );
        err.status = res.status;
        err.body = json;
        throw err;
      }
      return json;
    }
  }

  async myself() {
    return this.request("GET", "/rest/api/3/myself");
  }

  async project(key) {
    return this.request("GET", `/rest/api/3/project/${encodeURIComponent(key)}`);
  }

  async existingIssues(projectKey) {
    const out = [];
    let nextPageToken;
    do {
      const body = {
        jql: `project = ${projectKey} ORDER BY created ASC`,
        maxResults: 100,
        fields: ["summary", "issuetype", "parent"],
      };
      if (nextPageToken) body.nextPageToken = nextPageToken;
      const page = await this.request("POST", "/rest/api/3/search/jql", body);
      for (const i of page.issues || []) {
        out.push({
          key: i.key,
          summary: (i.fields.summary || "").trim(),
          type: i.fields.issuetype ? i.fields.issuetype.name : "",
          parent: i.fields.parent ? i.fields.parent.key : null,
        });
      }
      nextPageToken = page.isLast ? undefined : page.nextPageToken;
    } while (nextPageToken);
    return out;
  }

  async createIssue(fields) {
    const res = await this.request("POST", "/rest/api/3/issue", { fields });
    return res.key;
  }

  async deleteIssue(key) {
    await this.request("DELETE", `/rest/api/3/issue/${encodeURIComponent(key)}`);
  }
}

function backoff(attempt) {
  const base = 2000 * 2 ** (attempt - 1);
  const jitter = 0.7 + Math.random() * 0.6;
  return Math.min(60000, Math.round(base * jitter));
}

function summarizeJiraError(json) {
  const parts = [];
  for (const m of json.errorMessages || []) parts.push(m);
  for (const [field, msg] of Object.entries(json.errors || {})) parts.push(`${field}: ${msg}`);
  return parts.join(" | ");
}

/** --dry-run: pretends to be a project. With --fixture it starts from that project's work items. */
class SimulatedJira {
  constructor(existing, projectKey) {
    this.existing = existing.map((e) => ({ ...e, summary: (e.summary || "").trim() }));
    this.projectKey = projectKey;
    this.counter = this.existing.reduce((m, e) => Math.max(m, keyNum(e.key) || 0), 0);
    this.calls = 0;
  }
  async myself() {
    return { displayName: "(dry run — nobody)", emailAddress: "" };
  }
  async project(key) {
    return {
      key,
      name: "(dry run)",
      simplified: true,
      issueTypes: [
        { name: "Epic", id: "1", subtask: false },
        { name: "Task", id: "2", subtask: false },
        { name: "Subtask", id: "3", subtask: true },
      ],
    };
  }
  async existingIssues() {
    return this.existing;
  }
  async createIssue(fields) {
    this.counter++;
    const key = `${this.projectKey}-${this.counter}`;
    this.existing.push({
      key,
      summary: fields.summary,
      type: fields.issuetype.name,
      parent: fields.parent ? fields.parent.key : null,
    });
    return key;
  }
  async deleteIssue() {}
}

// ---------------------------------------------------------------------------
// The human-readable view (jira-seed.md)
// ---------------------------------------------------------------------------
function emitMarkdown(seed, issues, outPath) {
  const byKey = new Map(issues.map((i) => [i.courseKey, i]));
  const lines = [];
  lines.push(`# Course backlog — project \`${seed.project?.key || "SCRUM"}\` (generated from jira-seed.json)`);
  lines.push("");
  lines.push(`*Generated by \`scripts/jira-seed.mjs --emit-md\` — do not edit by hand; edit the JSON.*`);
  lines.push("");
  const epics = issues.filter((i) => i.type === "Epic").length;
  const tasks = issues.filter((i) => i.type === "Task").length;
  const subs = issues.filter((i) => i.type === "Subtask").length;
  lines.push(
    `**${issues.length} work items:** ${epics} epics · ${tasks} tasks · ${subs} case sub-tasks. Keys run ${issues[0].courseKey}..${issues[issues.length - 1].courseKey}; ${seed.placeholders?.count ?? 4} numbers below the first key are burned by placeholders so the keys match the course.`,
  );
  lines.push("");
  lines.push("| Key | Type | Parent | Priority | Labels | Summary |");
  lines.push("|---|---|---|---|---|---|");
  for (const i of issues) {
    lines.push(
      `| ${i.courseKey} | ${i.type} | ${i.parentCourseKey || "—"} | ${i.priority || "—"} | ${i.labels.join(", ") || "—"} | ${i.summary.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("");
  lines.push("## Descriptions");
  lines.push("");
  for (const epic of seed.epics) {
    lines.push(`### ${epic.courseKey} — ${epic.summary}`);
    lines.push("");
    if (epic.description) lines.push(epic.description.trim(), "");
    for (const task of epic.tasks || []) {
      lines.push(`#### ${task.courseKey} — ${task.summary}`);
      lines.push("");
      lines.push(
        `Labels: ${(task.labels || []).join(", ") || "—"}${task.tc ? ` · Covers: ${task.tc.join(", ")}` : ""}`,
      );
      lines.push("");
      if (task.description) lines.push(task.description.trim(), "");
      if ((task.subtasks || []).length) {
        lines.push("| Case | Priority | Env | Summary |");
        lines.push("|---|---|---|---|");
        for (const s of task.subtasks) {
          const env = (s.labels || []).filter((l) => l.startsWith("env-")).join(", ") || "—";
          lines.push(`| ${s.courseKey} | ${s.priority || "—"} | ${env} | ${s.summary.replace(/\|/g, "\\|")} |`);
        }
        lines.push("");
      }
    }
  }
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, lines.join("\n") + "\n");
  log(`wrote ${outPath} (${issues.length} work items)`);
  void byKey;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const { seed, issues } = loadSeed(opt.seed);

  if (opt.emitMd) {
    emitMarkdown(seed, issues, opt.emitMd);
    return;
  }

  const projectKey = opt.project;
  const placeholderCount = Number(seed.placeholders?.count ?? 4);
  const placeholderSummary = (n) =>
    `Placeholder ${n} of ${placeholderCount} — keeps course numbering aligned (safe to ignore)`;

  step(opt.dryRun ? "DRY RUN — nothing will be created" : "Seeding your Jira");
  log(
    `   seed: ${opt.seed} — ${issues.length} work items (${issues.filter((i) => i.type === "Epic").length} epics, ${issues.filter((i) => i.type === "Task").length} tasks, ${issues.filter((i) => i.type === "Subtask").length} sub-tasks)`,
  );
  log(`   keys: ${issues[0].courseKey} .. ${issues[issues.length - 1].courseKey}`);

  let jira;
  if (opt.dryRun) {
    let existing = [];
    if (opt.fixture) {
      const fx = JSON.parse(readFileSync(opt.fixture, "utf8"));
      existing = fx.existing || [];
      log(`   fixture: ${opt.fixture} — ${existing.length} existing work item(s)`);
    }
    jira = new SimulatedJira(existing, projectKey);
  } else {
    jira = new LiveJira(credentials(opt.env));
  }

  // 1. who am I, which project
  step("Checking access");
  const me = await jira.myself();
  log(`   ok: signed in as ${me.displayName || "?"}`);
  let project;
  try {
    project = await jira.project(projectKey);
  } catch (e) {
    die(
      `cannot open project ${projectKey}: ${e.message}\n     Create a team-managed Scrum space with key ${projectKey} first (lesson "Your Jira"), or pass --project <KEY>.`,
    );
  }
  const typeByName = new Map();
  for (const t of project.issueTypes || []) typeByName.set(t.name.toLowerCase().replace("-", ""), t);
  const typeId = (name) => {
    const t = typeByName.get(name.toLowerCase().replace("-", ""));
    if (!t) die(`project ${projectKey} has no "${name}" work type. Space settings → Work types, add it, then re-run.`);
    return t;
  };
  const epicType = typeId("Epic");
  const taskType = typeId("Task");
  const subtaskType = typeId("Subtask");
  log(
    `   ok: ${project.name} (${project.simplified ? "team-managed" : "company-managed"}) — work types Epic/Task/Subtask present`,
  );
  if (!project.simplified) {
    console.warn(
      "   note: this is a company-managed space. The course expects team-managed; creation should still work.",
    );
  }

  // 2. what is already there
  step("Reading what the project already contains");
  const existing = await jira.existingIssues(projectKey);
  const bySummary = new Map();
  for (const e of existing) if (!bySummary.has(e.summary)) bySummary.set(e.summary, e);
  const highest = existing.reduce((m, e) => Math.max(m, keyNum(e.key) || 0), 0);
  log(`   ${existing.length} existing work item(s); highest key number ${highest || "(none)"}`);

  const alreadySeeded = issues.filter((i) => bySummary.has(i.summary)).length;
  if (alreadySeeded)
    log(`   ${alreadySeeded} of ${issues.length} seed summaries already exist — those are reused, not duplicated`);

  // 3. placeholders — only on a fresh or nearly fresh space
  const firstNum = issues[0].num; // 5
  let placeholdersToMake = 0;
  if (!alreadySeeded && highest < firstNum - 1) placeholdersToMake = firstNum - 1 - highest;
  if (!alreadySeeded && highest >= firstNum) {
    console.warn(
      `   warning: the highest existing key is ${projectKey}-${highest}, so your keys will NOT match the course. A key map will be written — read it.`,
    );
  }
  const placeholders = [];
  if (placeholdersToMake) {
    step(
      `Burning ${placeholdersToMake} number(s) with placeholders (${projectKey}-${highest + 1}..${projectKey}-${firstNum - 1})`,
    );
    for (let n = 1; n <= placeholdersToMake; n++) {
      const summary = placeholderSummary(n);
      const key = await jira.createIssue({
        project: { key: projectKey },
        issuetype: { id: taskType.id, name: taskType.name },
        summary,
        description: toAdf("Created and deleted by scripts/jira-seed.mjs so that course keys line up. Safe to delete."),
      });
      placeholders.push(key);
      log(`   ${opt.dryRun ? "would create" : "created"} ${key}  ${summary}`);
    }
    if (opt.keepPlaceholders) {
      log("   --keep-placeholders: leaving them in place");
    } else {
      for (const key of placeholders) {
        await jira.deleteIssue(key);
        log(`   ${opt.dryRun ? "would delete" : "deleted"} ${key}`);
      }
    }
  }

  // 4. the backlog, in course order
  step(`Creating the backlog (${issues.length} work items, sequential, in course order)`);
  const resolved = new Map(); // courseKey → live key
  let created = 0;
  let reused = 0;
  const dropFields = new Set(); // fields this space refused (priority/labels) — learned once, then skipped

  for (const it of issues) {
    const hit = bySummary.get(it.summary);
    if (hit) {
      resolved.set(it.courseKey, hit.key);
      reused++;
      continue;
    }
    const parentKey = it.parentCourseKey ? resolved.get(it.parentCourseKey) : null;
    if (it.parentCourseKey && !parentKey)
      die(`parent ${it.parentCourseKey} of ${it.courseKey} was not created — stop and re-run`);
    const type = it.type === "Epic" ? epicType : it.type === "Task" ? taskType : subtaskType;
    const fields = {
      project: { key: projectKey },
      issuetype: { id: type.id, name: type.name },
      summary: it.summary,
    };
    const desc = toAdf(it.description);
    if (desc) fields.description = desc;
    if (parentKey) fields.parent = { key: parentKey };
    if (it.labels.length && !dropFields.has("labels")) fields.labels = it.labels;
    if (it.priority && !dropFields.has("priority")) fields.priority = { name: it.priority };

    let key;
    try {
      key = await jira.createIssue(fields);
    } catch (e) {
      const refused = Object.keys((e.body && e.body.errors) || {}).filter((f) => f === "priority" || f === "labels");
      if (e.status === 400 && refused.length) {
        for (const f of refused) {
          dropFields.add(f);
          delete fields[f];
          console.warn(
            `   note: this space refuses the "${f}" field on ${type.name} (add it under Space settings → Work types → ${type.name}); continuing without it`,
          );
        }
        key = await jira.createIssue(fields);
      } else {
        console.error(`\n   failed on ${it.courseKey} "${it.summary}": ${e.message}`);
        console.error(
          `   ${created} created so far. Fix the cause and re-run — existing summaries are reused, nothing is duplicated.`,
        );
        process.exit(1);
      }
    }
    resolved.set(it.courseKey, key);
    created++;
    const mark = key === it.courseKey ? "" : "   ← differs from the course key";
    if (opt.dryRun || it.type !== "Subtask" || key !== it.courseKey) {
      log(
        `   ${opt.dryRun ? "would create" : "created"} ${key.padEnd(10)} ${it.type.padEnd(7)} ${it.summary.slice(0, 70)}${mark}`,
      );
    } else if (created % 25 === 0) {
      log(`   … ${created} created`);
    }
    if (!opt.dryRun) await sleep(150); // stay well inside Jira's write limits
  }

  // 5. verify every course key resolved to the same live key
  step("Verifying keys");
  const drift = issues.filter((i) => resolved.get(i.courseKey) !== i.courseKey);
  log(
    `   created ${created}, reused ${reused}, placeholders ${placeholders.length}${placeholders.length && !opt.keepPlaceholders ? " (deleted)" : ""}, API calls ${jira.calls}`,
  );
  if (!drift.length) {
    log(
      `   ok: all ${issues.length} keys match the course (${issues[0].courseKey}..${issues[issues.length - 1].courseKey})`,
    );
  } else {
    console.warn(`   ${drift.length} key(s) differ from the course. Writing ${opt.keyMap}`);
    const lines = [
      "# Key map — course key → your key",
      "",
      `Generated by \`scripts/jira-seed.mjs\` on ${new Date().toISOString().slice(0, 10)}. The lessons cite the course key; use this table to find the same work item in your Jira.`,
      "",
      "| Course key | Your key | Type | Summary |",
      "|---|---|---|---|",
      ...issues.map(
        (i) => `| ${i.courseKey} | ${resolved.get(i.courseKey)} | ${i.type} | ${i.summary.replace(/\|/g, "\\|")} |`,
      ),
      "",
    ];
    if (!opt.dryRun) {
      mkdirSync(dirname(resolve(opt.keyMap)), { recursive: true });
      writeFileSync(opt.keyMap, lines.join("\n"));
    }
    log("");
    log(lines.slice(4, 4 + Math.min(12, issues.length)).join("\n"));
    if (issues.length > 12) log(`   … ${issues.length - 12} more rows in ${opt.keyMap}`);
  }

  if (!opt.dryRun) {
    const base = jira.base;
    log(
      `\nOpen ${base}/browse/${resolved.get("SCRUM-9") || issues[0].courseKey} — it should be "Automate environment & navigation smoke (UI)".`,
    );
  } else {
    log("\nDry run finished. Re-run without --dry-run to create these in your Jira.");
  }
}

main().catch((e) => {
  console.error(`\nerror: ${e.message}`);
  process.exit(1);
});
