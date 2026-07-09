# Relay Demo Option C — Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **NOTE (operator policy):** the `_ASSETS` demo scripts are this corpus's production code — author them IN-SESSION on Opus, not in a default subagent. Delegate only reads/research/review.

**Goal:** Rebuild the `_ASSETS/demo/` build as an Option C hybrid (real captured Relay UI + Arena-ported network shim) and prove ONE lane — the Support Triage Workflow Run — end-to-end so the behavioral gate goes green.

**Architecture:** A 4-stage pipeline under `_ASSETS/demo/scripts/`: (1) `capture-relay-demo.mjs` boots `npm run dev` against a freshly-seeded isolated data dir and Playwright-crawls 5 routes, saving post-hydration HTML + referenced `/_next` assets; (2) `derive-fixtures.mjs` reads the seed `fixture.json` and emits `fixtures.json`; (3) `build-relay-demo.mjs` stitches captured HTML + injects `boot.js`; (4) `verify-relay-demo.mjs` (rewritten) drives the state machine headlessly and gates on exit code. The mock (`app.js`/`app.css`/`html()` template) is deleted.

**Tech Stack:** Node ESM `.mjs`, Playwright (Relay-local dep, run via `node --preserve-symlinks`), Relay Next.js 16 dev server, `better-sqlite3` seed DB, static `http.server` for verification.

## Global Constraints

- **Strategy-owned corpus:** `_ASSETS/**` is gitignored in Relay; script edits get committed in the STRATEGY repo by the operator, NOT here. Relay-side commits cover only tracked files (none of `_ASSETS/**`). Do not `git add _ASSETS/...`.
- **Run Playwright/capture scripts with** `node --preserve-symlinks --preserve-symlinks-main` (Playwright reached through the `_ASSETS` symlink). Entrypoint guard must compare realpaths, not `import.meta.url === argv[1]`.
- **Fresh isolated data dir per capture run** — never `--reset-demo` on a reused DB (SQLite FK-constraint caveat, HANDOFF). Use `$(mktemp -d)/relay-demo-capture`.
- **Dev server needs the Turbopack native binding** — if `next dev` errors `Turbopack is not supported … native bindings`, run the CLAUDE.md fix (`rm -rf node_modules/@next/swc-darwin-arm64 && npm install @next/swc-darwin-arm64@16.2.4 --no-save --force`). Do NOT use `--webpack`.
- **Leak guard fails closed:** fixtures/HTML/JS must not contain `/Users/`, `/home/`, `.env`, `.git/`, real API-key names, `localhost:`/`127.0.0.1:` (except approved), private peer project names, or non-synthetic customer names.
- **Buy strip `live` default = `false`** — inert "buy opens at launch" state; never hardcode a live purchase URL.
- **Verifier wired-arg discipline:** every arg passed to a validator from `supervise-assets.mjs` must match that script's `parseArgs` (a wrong arg = false-red). Confirm by direct-run before trusting a red.
- **The headless verifier IS the gate** — it must assert + throw + exit non-zero; a GIF only shows.

---

### Task 1: Throwaway — delete the mock, stub the pipeline scripts

**Files:**
- Delete: `_ASSETS/demo/source/public/relay-demo/{app.js,app.css,favicon.svg}`
- Delete: `_ASSETS/demo/dist/relay/**` (all string-literal index.html + assets)
- Modify: `_ASSETS/demo/scripts/build-relay-demo.mjs` (remove `html()` template, `appJs()`, `css()`; keep arg parsing scaffold)
- Create: `_ASSETS/demo/scripts/capture-relay-demo.mjs` (stub — `main()` prints "not implemented", exit 1)
- Create: `_ASSETS/demo/scripts/derive-fixtures.mjs` (stub)

**Interfaces:**
- Produces: three script files with a shared `parseArgs(argv)` convention and a realpath-comparing entrypoint guard.

- [ ] **Step 1: Delete the mock assets and dist tree**

```bash
cd /Users/manavsehgal/orionfold/relay/_ASSETS/demo
rm -f source/public/relay-demo/app.js source/public/relay-demo/app.css source/public/relay-demo/favicon.svg
rm -rf dist/relay
```

- [ ] **Step 2: Reduce `build-relay-demo.mjs` to a stub**

Strip everything that renders mock markup. Leave only the arg scaffold + a `main()` that throws "not implemented — see Task 4". Keep the `parseArgs`/`normalizeBasePath` helpers (reused in Task 4).

- [ ] **Step 3: Create the entrypoint-guard helper pattern** (used by every new script)

```js
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
function isMain(metaUrl) {
  try { return realpathSync(fileURLToPath(metaUrl)) === realpathSync(process.argv[1]); }
  catch { return false; }
}
// at file end:  if (isMain(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Create stubs for `capture-relay-demo.mjs` + `derive-fixtures.mjs`**

Each: `parseArgs` for `--data-dir`/`--out`/`--port`, a `main()` that `throw new Error("not implemented")`, and the `isMain` guard.

- [ ] **Step 5: Verify stubs run and fail cleanly**

Run: `node --preserve-symlinks _ASSETS/demo/scripts/capture-relay-demo.mjs`
Expected: prints the error, exits 1.

- [ ] **Step 6: (No Relay commit — `_ASSETS` is gitignored.)** Note the deletion in the session log; operator commits `_ASSETS` in the strategy repo.

---

### Task 2: `derive-fixtures.mjs` — DERIVE fixtures from the seed universe

**Files:**
- Modify: `_ASSETS/demo/scripts/derive-fixtures.mjs`
- Test: `_ASSETS/demo/scripts/derive-fixtures.test.mjs` (node:test)

**Interfaces:**
- Consumes: `_ASSETS/seed/data/fixture.json` (customers, projects, workflows, tables, tasks).
- Produces: `source/public/relay-demo/fixtures.json` with top-level keys `schema_version`, `seed_version`, `disclosure`, `buy` (`{live:false, note}`), `workflows[]`, `tasks[]`, `notifications[]`, `usageLedger[]`, `streams{logs}`, `machine` (the Support Triage config: workflowId, approvalId, childTask, ledgerRow, monitor events).
- Exposes `deriveFixtures(seed) → fixtureObject` (pure, testable) + `main()` (IO).

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveFixtures } from "./derive-fixtures.mjs";
const seed = JSON.parse(await import("node:fs").then(m => m.promises.readFile(new URL("../../seed/data/fixture.json", import.meta.url), "utf8")));
test("derives the Support Triage machine from seed", () => {
  const fx = deriveFixtures(seed);
  assert.equal(fx.machine.workflowId, "demo_workflow_support_triage");
  assert.ok(fx.workflows.find(w => w.id === "demo_workflow_support_triage" && w.status === "active"));
  assert.equal(fx.buy.live, false);
  assert.ok(fx.machine.approval && fx.machine.ledgerRow && Array.isArray(fx.machine.monitorEvents));
});
test("no forbidden leak strings in serialized fixtures", () => {
  const s = JSON.stringify(deriveFixtures(seed));
  for (const bad of ["/Users/", "/home/", "ANTHROPIC_API_KEY", "localhost:"]) assert.ok(!s.includes(bad), bad);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --preserve-symlinks _ASSETS/demo/scripts/derive-fixtures.test.mjs`
Expected: FAIL — `deriveFixtures` not exported.

- [ ] **Step 3: Implement `deriveFixtures(seed)`**

Map seed → fixture shape. `workflows` = `seed.workflows` projected to `{id,name,status,pattern,runNumber,projectId}`. `machine` = a hand-built config object for `demo_workflow_support_triage`: `{workflowId, childTask:{id,name,status:"waiting_for_human"}, approval:{id:"demo_appr_bl1048", title:"Approve refund-policy reply for order #BL-1048"}, ledgerRow:{label, costMicros:420000}, monitorEvents:[{t:0,text:"Support row trigger fired"},{t:1200,text:"Approval requested"},{t:2400,text:"Response approved"}]}`. `disclosure` = the honest demo string. `buy` = `{live:false, note:"Demo — buy opens at launch."}`.

- [ ] **Step 4: Implement `main()`** — read seed, write `source/public/relay-demo/fixtures.json`, print counts.

- [ ] **Step 5: Run tests + the script**

Run: `node --test --preserve-symlinks _ASSETS/demo/scripts/derive-fixtures.test.mjs` → PASS
Run: `node --preserve-symlinks _ASSETS/demo/scripts/derive-fixtures.mjs` → writes fixtures.json, prints counts.

---

### Task 3: `capture-relay-demo.mjs` — Playwright crawl of the seeded live dev server

**Files:**
- Modify: `_ASSETS/demo/scripts/capture-relay-demo.mjs`

**Interfaces:**
- Consumes: seed script (`_ASSETS/seed/scripts/seed-relay-demo.mjs --data-dir <dir>`); Relay `npm run dev`; Playwright (`import { chromium } from "playwright"`).
- Produces: `source/captured/<routeSlug>/index.html` (post-hydration outerHTML with `<base>` rewritten + boot.js `<script>` injected placeholder) + `source/captured/_next/**` (referenced static chunks), for routes `/ , /workflows, /tasks, /monitor, /inbox`.

- [ ] **Step 1: Write the boot-and-seed helper**

`async function bootSeededDev(port)`: `const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "relay-demo-capture-"))`; run seed via `execFileSync("node", ["--preserve-symlinks", SEED_SCRIPT, "--data-dir", dataDir])`; `spawn("npm", ["run", "dev"], { env: { ...process.env, RELAY_DATA_DIR: dataDir, PORT: String(port) } })`; poll `http://127.0.0.1:${port}/` until 200 (60s timeout, clear Turbopack-binding error message on failure per Global Constraints). Return `{child, dataDir}`.

- [ ] **Step 2: Write the capture loop**

For each route: `page.goto(url, {waitUntil:"networkidle"})` — BUT Relay SSE keeps networkidle from settling (marketing-screenshot caveat), so use `waitUntil:"domcontentloaded"` then an explicit `page.waitForSelector` on a known post-hydration element per route (e.g. `/workflows` → a card or the empty-state), then `page.content()`. Save outerHTML. Collect `_next` asset URLs from `performance.getEntriesByType("resource")`, download each once into `source/captured/_next/`.

- [ ] **Step 3: Rewrite asset paths + inject boot.js placeholder**

In each captured HTML: rewrite absolute `/_next/…` → `./_next/…` relative to the demo base; insert `<script src="../relay-demo/boot.js"></script>` as the FIRST `<head>` child (so it runs before chunk hydration). Leave a `<!--BOOT-->` marker Task 4 can also target.

- [ ] **Step 4: Teardown** — kill dev child, `fs.rm(dataDir, {recursive:true})`.

- [ ] **Step 5: Manual smoke** (this is capture infra — verify by running it)

Run: `node --preserve-symlinks _ASSETS/demo/scripts/capture-relay-demo.mjs --port 3210`
Expected: `source/captured/{index,workflows,tasks,monitor,inbox}/index.html` exist; `_next/` populated; teardown clean. Confirm one HTML contains real shadcn classes (`grep -l 'rounded-lg border' source/captured/workflows/index.html`).

---

### Task 4: `boot.js` — the network + EventSource shim (ported from Arena)

**Files:**
- Create: `_ASSETS/demo/source/public/relay-demo/boot.js`
- Test: `_ASSETS/demo/scripts/boot-shim.test.mjs` (node:test with jsdom-free logic extraction OR a Playwright unit — see Step 1)

**Interfaces:**
- Consumes: `fixtures.json` (Task 2 shape).
- Produces: global `window.__RELAY_DEMO__`, shimmed `fetch` + `EventSource`, mutable demo state, `emitApprovals()`/`emitLogs()` re-emit helpers, DEMO ribbon, coach, buy strip.

- [ ] **Step 1: Port the Arena shim skeleton**

Copy the structure from `~/ainative-business.github.io/arena-app/public/arena-demo/boot.js`: IIFE + boot guard, `pathOf`/`jsonResponse`/`sseResponse(events,signal)` helpers (SSE via `ReadableStream` emitting `event:/data:` frames), fetch shim, `DemoES` EventSource shim with `_emit`/`close`, fixtures loader. Keep verbatim the ReadableStream SSE machinery and DemoES lifecycle (proven-correct).

- [ ] **Step 2: Implement the Relay fetch routes** (per spec §A/§B/§C/§E)

Global neutralizers: `/api/notifications?countOnly` → `{count}`, `POST /api/notifications/pending-approvals` → `{pending: state.approvals}`, `/api/settings/*|/api/instance/*` → stubs. Data GETs: `/api/workflows` → `fixtures.workflows`, `/api/tasks` → `fixtures.tasks`. State machine: `POST /api/workflows/<id>/execute` → mutate `state.workflows` status queued→running, `setTimeout` → waiting_for_human + push approval + `emitApprovals()` + push monitor events + `emitLogs()`. `POST …/pending-approvals/<id>/approve` → status→completed + push ledger row. `POST …/stop` → stopped. Catch-alls: GET→`{}`, POST→`{ok:true,demo:true}`, else real fetch.

- [ ] **Step 3: Implement `DemoES` for the 2 URLs**

`/api/notifications/pending-approvals/stream` → register subscriber, emit snapshot on attach + on `emitApprovals()`. `/api/logs/stream` → replay `state.monitorEvents` on cadence via `emitLogs()`. Non-matching URL → real `EventSource`.

- [ ] **Step 4: Ribbon + coach + buy strip**

Ribbon: fixed bottom, `role="note"`, install line. Coach: port `demoCoach`/`coachFind`, plan = `[{page:"workflows", get:Run button, done:"click"}, {page:"inbox", get:Approve button, done:"click"}]`, reduced-motion fallback. Buy strip: sticky; if `fixtures.buy.live` false → inert note, else (future) real CTA.

- [ ] **Step 5: Test the fetch-route logic**

Extract the pure route-matching into a testable `resolveFetch(path, method, body, state, fixtures)` and unit-test: execute→running, approve→completed+ledger, unknown GET→`{}`. Run: `node --test --preserve-symlinks _ASSETS/demo/scripts/boot-shim.test.mjs` → PASS.

---

### Task 5: `build-relay-demo.mjs` — stitch captured HTML + shim into `dist/`

**Files:**
- Modify: `_ASSETS/demo/scripts/build-relay-demo.mjs`

**Interfaces:**
- Consumes: `source/captured/**`, `source/public/relay-demo/{boot.js,fixtures.json}`.
- Produces: `dist/relay/demo/<route>/index.html`, `dist/relay/demo/relay-demo/{boot.js,fixtures.json}`, `dist/relay/demo/_next/**`, `dist/.nojekyll`.

- [ ] **Step 1: Implement the copy+stitch**

Copy `source/captured/_next` → `dist/relay/demo/_next`; copy each captured `index.html` → `dist/relay/demo/<route>/index.html`; copy `boot.js`+`fixtures.json` → `dist/relay/demo/relay-demo/`; ensure the boot `<script src>` resolves relative to each route depth. Write `.nojekyll`. Write a `build-manifest.json` (routes, assets, generatedFrom).

- [ ] **Step 2: Build + serve-smoke**

Run: `node --preserve-symlinks _ASSETS/demo/scripts/build-relay-demo.mjs`
Then: `cd _ASSETS/demo/dist && python3 -m http.server 8099 &` and load `http://localhost:8099/relay/demo/workflows/` in a browser — assert real Relay UI renders, DEMO ribbon present, no failing `/api/*` in console. Kill server.

---

### Task 6: `verify-relay-demo.mjs` — rewrite as the behavioral gate

**Files:**
- Modify: `_ASSETS/demo/scripts/verify-relay-demo.mjs`

**Interfaces:**
- Consumes: `dist/` (served static), Playwright.
- Produces: `reports/behavioral.json`, `reports/leaks.json`; exit non-zero on any failure.

- [ ] **Step 1: Serve dist + drive the state machine**

Boot `http.server` on an ephemeral port serving `dist/`. Playwright: goto `/relay/demo/workflows/`; assert real DOM (shadcn card class + a real seed workflow name string, NOT mock `.rail`). Click Run on Support Row Triage → `waitForFunction` status text `running` then `waiting`. Goto `/inbox` → assert approval item text present. Click Approve → assert workflow `completed`. Goto `/monitor` → assert ≥1 event row. Goto `/costs` (if captured; else assert ledger via fixtures state) → assert ledger row.

- [ ] **Step 2: Leak + coverage checks**

Scan all `dist/**` text files for forbidden strings → fail closed. Assert no unhandled `/api/*` (collect page `requestfailed` + console errors). Assert every referenced asset resolves (no 404).

- [ ] **Step 3: Exit-code contract**

Any assertion failure → `console.error` + `process.exit(1)`. Success → write reports, exit 0.

- [ ] **Step 4: Run the gate**

Run: `node --preserve-symlinks _ASSETS/demo/scripts/verify-relay-demo.mjs --demo-dist _ASSETS/demo/dist`
Expected: PASS, exit 0, `reports/behavioral.json.ran === true`.

---

### Task 7: Wire into the `assets-flow` supervisor gate

**Files:**
- Modify: `_ASSETS/flow/manifest.json` (demo validator `requires:["demoDist"]` + args)
- Verify: `_ASSETS/flow/scripts/supervise-assets.mjs` token expansion

- [ ] **Step 1: Confirm the demo validator entry**

In `manifest.json`, the demo stage's behavioral validator = `{script:"demo/scripts/verify-relay-demo.mjs", args:["--demo-dist","{demoDist}"], requires:["demoDist"]}`. Confirm every arg matches `verify-relay-demo.mjs` `parseArgs` (direct-run first).

- [ ] **Step 2: Run the gate with demoDist**

Run: `node --preserve-symlinks _ASSETS/flow/scripts/supervise-assets.mjs --run-validators --demo-dist _ASSETS/demo/dist`
Expected: demo stage no longer AMBER-skipped; folds toward GREEN if seed also provided.

- [ ] **Step 3: Run without demoDist (back-compat)**

Run: `node --preserve-symlinks _ASSETS/flow/scripts/supervise-assets.mjs --run-validators`
Expected: demo behavioral SKIPS with reason (AMBER), never silently green.

---

### Task 8: Update `_ASSETS/demo/README.md` + session log

**Files:**
- Modify: `_ASSETS/demo/README.md` (replace "specification-only" framing → the built pipeline + how to run capture→derive→build→verify)

- [ ] **Step 1: Document the 4-command pipeline + the fresh-data-dir + Turbopack landmines.**
- [ ] **Step 2: End-to-end check** — run the full sequence clean from a cold state; confirm gate green.

---

## Self-Review

**Spec coverage:**
- Throwaway → Task 1 ✓ · DERIVE fixtures → Task 2 ✓ · Playwright capture → Task 3 ✓ · boot.js shim (§A-E) → Task 4 ✓ · SSE 2-URL → Task 4 Step 3 ✓ · guidance layer → Task 4 Step 4 ✓ · build stitch → Task 5 ✓ · behavioral gate → Task 6 ✓ · supervisor wiring → Task 7 ✓ · README + e2e → Task 8 ✓.
- State machine (execute→waiting→approve→completed→ledger) covered in Task 4 Step 2 + asserted in Task 6 Step 1. ✓
- Leak guard: Task 2 (fixtures) + Task 6 Step 2 (dist). ✓
- Out-of-scope items (other machines, ~30 routes, deploy, responsive) — correctly absent. ✓

**Placeholder scan:** No "TBD/handle edge cases/similar to Task N". Code shown for test steps; capture/build/verify steps describe concrete Playwright calls + file ops. ✓

**Type consistency:** `deriveFixtures(seed)→fixture` used in Task 2/4/6; `machine.workflowId="demo_workflow_support_triage"`, `approval.id="demo_appr_bl1048"` consistent across Task 2 (produce), Task 4 (consume), Task 6 (assert). `resolveFetch` naming consistent Task 4. ✓

**Note on commits:** No `git add _ASSETS/**` anywhere — corpus is gitignored; operator commits strategy-side. Relay-side commit at end covers only this plan/spec doc + any HANDOFF update.
