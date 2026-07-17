# Orionfold Relay

> Run a forward-deployed AI agency on one cockpit. Every client a workspace, every vertical a profile, every service a workflow, every model a switch — on one governed, cost-controlled board you own.

```bash
npx orionfold-relay
```

Open [localhost:3000](http://localhost:3000). Zero config, local SQLite, your data stays on your machine.

[![npm](https://img.shields.io/npm/v/orionfold-relay)](https://www.npmjs.com/package/orionfold-relay) [![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/) [![React 19](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev/) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)](https://www.typescriptlang.org/) [![Claude Agent SDK](https://img.shields.io/badge/Claude-Agent_SDK-D97706)](https://docs.anthropic.com/) [![OpenAI Codex App Server](https://img.shields.io/badge/OpenAI-Codex_App_Server-10A37F)](https://developers.openai.com/codex/app-server) [![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Orionfold Relay is the **operations layer** for AI builders, consultants, and forward-deployed services teams — the missing layer between "run one agent" and "run a managed service for a roomful of clients." You point it at your client work, run multi-step workflows across local and cloud models, route every client-facing deliverable through human approval, and watch per-client cost roll up automatically. It's local-first, open source (Apache-2.0), and ships as one command.

Relay is the **third** product in the Orionfold line — **Proof** answers *"which AI can I trust?"*, **Arena** answers *"which build wins?"*, and **Relay** answers *"now make the trusted AI do the actual work."* It's the only one whose value compounds *after* evaluation stops.

<img src="https://raw.githubusercontent.com/orionfold/relay/main/public/readme/home-list.png" alt="The Relay home workspace: active work, pending review, project signals, and a live agent activity stream on one board" width="1200" />

---

## Describe a pack — Relay builds it

The proof is in what Relay composes, not what it benchmarks. You describe a client module in plain language, and Relay assembles it from its primitives — an agent profile, a workflow blueprint, a schedule, and a table or two — into one installed pack. No new code, no deploy.

A "receipt photo → bookkeeping" module for a property-management client is one prompt away; the next client who needs the same thing reuses it in minutes. The installed pack runs as a first-class instance with its own KPIs, and every agent run under it meters real cost back to that customer — the hardcoded billing line is gone, replaced by live per-client attribution from the usage ledger.

<img src="https://raw.githubusercontent.com/orionfold/relay/main/public/readme/apps-starter-to-chat.png" alt="Describe a pack in plain language and Relay composes it from a profile, blueprint, schedule, and tables — no code, no deploy" width="1200" />

| Compose a pack | Packs gallery | Inside an installed pack |
|:-:|:-:|:-:|
| Plain-language prompt → a profile + blueprint + schedule + tables, wired into one running module | Installed packs run as first-class instances alongside ready-made starters | Live KPI tiles plus every service workflow as a one-click run — a whole vertical, composed not coded |

---

## The five gaps every AI agency hits

AI agents can already abstract a lease, research a grant, or categorize a receipt. The gap is everything *around* that — and for an agency, every gap multiplies by the number of clients you serve.

1. **Orchestration** — Real client work is multi-step: ingest, abstract, verify, deliver. Relay runs sequences, checkpoints, and planner→executor pipelines without glue code you'd maintain.
2. **Strategy → execution** — You think in clients, services, and deliverables; agent tools think in prompts and tokens. Projects, profiles, and blueprints give you a shared language between the engagement and the execution.
3. **Lifecycle** — A deliverable needs scheduling, retries, resume-from-checkpoint, cost tracking, and an audit trail. Relay carries the whole operational lifecycle; recurring statements and deadline watches run themselves.
4. **Trust & governance** — Agents that read client files and draft client-facing output need guardrails. Relay routes every deliverable through human approval and keeps the audit trail funders and stakeholders ask for.
5. **Distribution** — Standing up an agent workspace shouldn't mean cloning a repo and wiring a database. Relay is `npx orionfold-relay` — one command, zero config, your data stays local.

---

## Built for an agency

| Your operating model | Relay primitive |
|---|---|
| **Clients** → one workspace per client, with scoped reference docs the agents consult automatically | **Projects** |
| **Verticals** → CRE underwriting, listing analysis, grant research, impact reporting — each a tuned agent | **Profiles** (21 built-ins) |
| **Services** → a repeatable, packaged service you instantiate per client with their variables | **Blueprints** (15 templates) |
| **Deliverables** → weekly digests, monthly statements, deadline watches running on a cadence | **Schedules** |
| **Billing** → per-client spend allocation that maps to the retainer, with a real margin you can see | **Cost & Usage** |
| **Governance** → every client-facing deliverable through human approval with a full audit trail | **Inbox** |

<img src="https://raw.githubusercontent.com/orionfold/relay/main/public/readme/tasks-list.png" alt="One Kanban board: multi-step, multi-client work across every status, each card carrying its client, workflow pattern, and assigned agent profile" width="1200" />

---

## The three pillars

### 1 · One cockpit, your whole client book
Every client is a project with its own scoped documents, tasks, and working directory. One Kanban board replaces a wall of browser tabs and a "who's doing what" spreadsheet: lease abstraction, an offering memo, a grant narrative, receipt intake — across clients, every status, on one screen. Drag-and-drop columns or a sortable table.

### 2 · Multi-vendor, no lock-in
Different work wants different models, and the best model changes every few months. A shared runtime registry lets you switch providers **per task, per schedule, or per workflow step** without redefining how your agents behave. Run reasoning on **Claude**, code generation on **Codex**, document work on **Gemini**, and route low-stakes or sensitive work to a local **Ollama** model at $0 compute. The cost dashboard shows the blended mix so you can prove the savings.

<img src="https://raw.githubusercontent.com/orionfold/relay/main/public/readme/costs-list.png" alt="Cost & Usage: spend pacing, active provider mix, and per-project allocation that maps straight to a client retainer" width="1200" />

### 3 · Zero-code apps
Profiles, blueprints, schedules, and tables are the Lego bricks. Describe what you want and Relay composes a running app from them — the fastest way an agency ships a new client module. Package a whole vertical (profiles + workflows + a table + KPIs) as one pure-config bundle and install it in one click.

---

## Customers — now first-class

The customer dimension is **shipped**. Each account you run ops for is a first-class customer record — not a naming convention on a project. Link a customer's projects, and every agent run under them attributes its spend back automatically, so per-client cost is a real rollup from the usage ledger rather than a number you reconcile by hand. That foundation is the seam every pack seeds customers through, and the base for retainer-vs-cost margin.

| The customer book | A customer detail view |
|:-:|:-:|
| <img src="https://raw.githubusercontent.com/orionfold/relay/main/public/readme/customers-list.png" alt="The customer book: each account labeled by vertical, with linked projects and a 30-day cost rollup per customer" width="580" /> | <img src="https://raw.githubusercontent.com/orionfold/relay/main/public/readme/customers-detail.png" alt="A customer detail view: linked projects and AI spend rolled up from real agent runs — live per-client attribution, not a hardcoded billing line" width="580" /> |

---

## Orchestration — simple to governed

A workflow is how a repeatable service runs itself. The same screen runs **six patterns**:

- **Sequence** — a clean chain of steps an agent works top to bottom
- **Planner→Executor** — one agent plans, another executes each step
- **Human-in-the-Loop Checkpoint** — pauses at approval gates so nothing client-facing ships without sign-off
- **Parallel** — 2–5 concurrent branches followed by one synthesis step
- **Loop** — iterative execution with configurable stop conditions
- **Swarm** — mayor → worker pool → refinery orchestration

The governance is *in* the workflow, not bolted on. A blueprint is a fixed step shape plus a Configure form — fill in a client's variables and it becomes a ready-to-run workflow, the same service instantiated for the next client in minutes.

<img src="https://raw.githubusercontent.com/orionfold/relay/main/public/readme/workflows-blueprints.png" alt="Workflow blueprints: a fixed step shape with per-step agent profile and approval gates, plus a Configure form to instantiate per client" width="1200" />

---

## Why it stays trustworthy

- **Local-first** — SQLite database, no cloud dependency, `npx orionfold-relay` and go
- **Relay never sends your data to Orionfold** — no telemetry, no update checks, no license server; the complete outbound-network inventory is documented and code-linked in [docs/trust/data-flow.md](docs/trust/data-flow.md)
- **Your rules, enforced** — tool permissions, inbox approvals, and audit trails for every agent action
- **Your AI team** — 21 specialist profiles ready to deploy, each with instructions, tool policies, and runtime tuning
- **Know what you spend** — usage metering, budgets, and per-provider/per-model spend visibility on governed runs
- **Open source & verifiable** — Apache-2.0, read the engine and run it yourself; every npm release ships with a provenance attestation and a CycloneDX SBOM ([docs/trust/supply-chain.md](docs/trust/supply-chain.md))

Evaluating Relay for an enterprise? The full trust pack — [security packet](docs/trust/security-packet.md), [data-flow disclosure](docs/trust/data-flow.md), [supply-chain verification](docs/trust/supply-chain.md), [plain-language license terms](docs/trust/license-terms.md), and [continuity statement](docs/trust/continuity.md) — lives in [`docs/trust/`](docs/trust/). Vulnerability reports: [SECURITY.md](SECURITY.md).

<img src="https://raw.githubusercontent.com/orionfold/relay/main/public/readme/inbox-list.png" alt="The governance command center: tool-permission approvals, agent questions, and a permission queue — nothing reaches a client without sign-off" width="1200" />

---

## Free vs paid

**The engine is free.** Everything above — orchestration, governance, runtimes,
profiles, tables, workflows, the full app, and direct single-Cell operation —
is Apache-2.0 open source with no tiers or feature locks. The public Relay Cell
OCI image is another distribution form of that free runtime. Paid products add
maintained content or managed lifecycle authority; they do not repossess Core.

| Product | What is free | What a license adds |
|---|---|---|
| Relay Core | npm CLI/app and direct unmanaged single Cell | Nothing; Core remains free |
| Relay Cell OCI image | Public, signed Cell-runtime bytes when G-094 publishes them | Nothing; image possession is not an entitlement |
| Relay Packs | Free Packs and every installed Pack keep working | `product:orionfold-relay` permits premium Pack installation and forward updates |
| Relay Host | Host/Cell contract and free direct Cell remain available | `product:relay-host` permits the npm-delivered supervisor to manage one Host and up to ten managed Cells under the launch contract |
| Operator bundle | Same free Core and image | Both independent entitlements in one signed envelope; Pack seats never become Host/Cell capacity |

The managed Host supervisor and public Cell registry are release-train work, not
features in the current npm release. Their accepted fulfillment contract is
documented now so the Website issuer, future supervisor, and customer promise
cannot drift.

Buying one takes a license file, redeemed once:

```bash
relay license add <path-or-url from your fulfilment email>   # verify + save + unlock
relay license status                                         # who's licensed, what's unlocked, until when
relay license remove <license-id>                            # forget a license (packs stay installed)
```

- **Verification is 100% offline** — an Ed25519 signature check against keys embedded in
  this repo ([`src/lib/licensing/verify.ts`](src/lib/licensing/verify.ts)). Relay never
  sends your data to Orionfold: no activation server, no telemetry, no network call of
  any kind. Works air-gapped.
- **Your packs are yours forever.** An expired or removed Pack license never
  re-locks installed content; it only gates new premium installs and updates.
- **A Host lapse never strands a Cell.** Under the accepted Host contract,
  existing Cells keep running and remain startable, exportable, recoverable,
  rollback-capable, and eligible for compatible critical security updates.
  Lapse blocks new managed Cells and routine forward feature upgrades.
- **What's free stays free.** Capabilities never move from the free engine into a paid
  pack. Paid packs are new content, not repossessed features.

The full terms in plain language — seats, transfer, what expiry does and doesn't do —
are in [docs/trust/license-terms.md](docs/trust/license-terms.md), with the
three-authority Host/OCI boundary in
[docs/relay-host-fulfillment.md](docs/relay-host-fulfillment.md). Canonical
Relay prices and terms come from
[orionfold.com/relay/pricing.json](https://orionfold.com/relay/pricing.json);
Relay does not hardcode a Host amount before the Website publishes the offer.
The gating
philosophy behind the boundary — and the never-regress promise that binds us to it —
is published at [orionfold.com/promise](https://orionfold.com/promise/). Browse and
buy premium packs at [orionfold.com/relay](https://orionfold.com/relay/).

---

## Runtime bridge

Run the same business process on different AI providers without changing a line of configuration. Relay's shared runtime registry routes tasks, schedules, and workflow steps through **Claude Code** (Anthropic Claude Agent SDK) and **OpenAI Codex App Server**, landing everything in the same inbox, monitoring, and cost surfaces. Switching providers is a settings change, not a rewrite.

---

## Tech stack (boring on purpose)

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 16 + React 19 | Server Components for zero-API reads, Turbopack for fast dev |
| Language | TypeScript (strict) | End-to-end type safety from DB schema to UI |
| Styling | Tailwind CSS v4 + shadcn/ui | Utility-first CSS with accessible component primitives |
| Database | SQLite (WAL) + Drizzle ORM | Zero-config embedded DB, type-safe queries, concurrent reads |
| AI Runtime | `@anthropic-ai/claude-agent-sdk` + `codex app-server` | Governed Claude and OpenAI execution behind a shared runtime layer |
| CLI | Commander + tsup | Familiar CLI framework, fast ESM bundling |
| Testing | Vitest + Testing Library | Fast test runner with React component testing |
| Validation | Zod v4 | Runtime type validation at system boundaries |

npm distribution name: `orionfold-relay` (CLI commands `relay` / `orionfold-relay`).

---

## Development

Relay requires Node.js 20 or newer. A source checkout must enter Relay development
mode **before the first app boot** so customer-instance bootstrap cannot create local
branches, install git hooks, or register instance automation in the contributor clone.

macOS or Linux:

```bash
git clone https://github.com/orionfold/relay.git
cd relay
npm install

cat > .env.local <<'EOF'
RELAY_DEV_MODE=true
RELAY_DATA_DIR=./.relay-dev-data
EOF
touch .git/relay-dev-mode

npm run dev
```

Windows PowerShell:

```powershell
git clone https://github.com/orionfold/relay.git
Set-Location relay
npm install

@'
RELAY_DEV_MODE=true
RELAY_DATA_DIR=./.relay-dev-data
'@ | Set-Content .env.local
New-Item -ItemType File .git/relay-dev-mode -Force | Out-Null

npm run dev
```

The two gates are intentionally redundant. `RELAY_DEV_MODE=true` is the primary
per-developer gate; `.git/relay-dev-mode` survives `.env.local` edits and protects the
clone independently. `RELAY_DATA_DIR` keeps development data inside an ignored,
clone-local directory, so a literal fresh clone starts empty and does not reuse
`~/.relay`. You can verify either gate independently by removing the other one.

Provider credentials are optional at boot. Open [Settings](http://localhost:3000/settings)
to save or test Anthropic, OpenAI, Ollama, LiteLLM, or LM Studio configuration
and receive a visible success or failure result. Keep real keys in `.env.local`
or enter them through Settings; never commit them. See the
[LiteLLM and LM Studio setup guide](docs/openai-compatible-runtimes.md) for
server-origin networking, authentication, and capability details.

To exercise customer-instance bootstrap deliberately from a development checkout,
run it only against isolated data with `RELAY_INSTANCE_MODE=true`; this explicit
override wins over both development gates.

Common commands:

```bash
npm run dev            # Next.js dev server (Turbopack)
npm run build:cli      # Build CLI → dist/cli.js
npm test               # Run Vitest
npm run test:hooks     # Run the cross-platform Codex hook regressions
npm run test:coverage  # Coverage report
npm run test:e2e       # E2E integration tests (requires runtime credentials)
```

### Pull requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes and add tests
4. Run `npm test` and `npx tsc --noEmit`
5. Submit a pull request

See `AGENTS.md` for architecture details and development conventions, and `CHANGELOG.md` for release history.

---

<details>
<summary><b>Full feature inventory</b> — 211 features shipped across the platform</summary>

All 14 MVP features shipped (CLI bootstrap, database schema, app shell, project management, task board, agent integration, inbox notifications, monitoring, homepage dashboard, workflow engine, AI task assist, content handling, session management). 197 more shipped post-MVP:

| Category | Highlights |
|----------|-----------|
| **Documents** (5) | File attachments, preprocessing (5 formats), agent context injection, document browser, output generation |
| **Agent Intelligence** (6) | Multi-agent routing, autonomous loops, multi-agent swarm, AI assist→workflows, agent self-improvement, workflow context batching |
| **Agent Profiles** (2) | Agent profile catalog (21 profiles), workflow blueprints (15 templates) |
| **UI Enhancement** (13) | Ambient approvals, learned-context UX, micro-visualizations, command palette, accessibility, kanban operations, board persistence, playbook docs, workflow UX overhaul |
| **Platform** (8) | Scheduled prompt loops, tool permissions, provider runtimes, OpenAI Codex runtime, cross-provider profiles, parallel fork/join, tool permission presets, npm publish |
| **Runtime Quality** (2) | SDK runtime hardening, E2E test automation |
| **Governance** (3) | Usage metering ledger, spend budget guardrails, cost & usage dashboard |
| **Chat** (12) | 5-tier context engine + CRUD tools, SSE streaming, tool catalog, skill composition, `#key:value` filters, saved searches, conversation branching/rewind (`⌘Z`/`⌘⇧Z`), chat-driven app builder |
| **Packs** (10) | `/packs` browser, compatible `/apps` installed-pack surface, starters showcase, 6 layout kits (Tracker, Coach, Ledger, Inbox, Research, Workflow Hub), manifest authoring tools, atomic writes, KPI ratio composition |
| **Onboarding** (2) | First-launch runtime preference modal (Best quality / Balanced / Lowest cost / Best privacy), instance bootstrap with dev-mode gate |
| **Customers** (first-class) | Hard `customers` table, write-time cost attribution, per-customer rollup, `/customers` list + detail |
| **Plugin Platform** (5) | Chat-tools plugin kind, MCP plugin spec, plugin tools registry, plugin spec tools, schedule spec tools |
| **Platform Hardening** (2) | Runtime validation hardening, upgrade detection (hourly upstream poll + guided merge sessions) |
| **Environment** (11) | Scanner, cache, dashboard, git checkpoint manager, sync engine, project onboarding, templates, cross-project comparison, skill portfolio, health scoring, profile-from-environment |

See `features/roadmap.md` for the historical feature inventory and
`features/stats/snapshot.json` for canonical counts.

</details>

---

## License

Licensed under the [Apache License 2.0](LICENSE).

Copyright 2025–2026 [Manav Sehgal](https://github.com/manavsehgal)
