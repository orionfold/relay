---
title: "Security packet"
category: "trust"
lastUpdated: "2026-07-16"
---

# Orionfold Relay — security packet

A concise security overview for evaluators, written to be handed to a
security review as-is. Every claim links to the code or document that backs
it. Companion pages: [data flow](./data-flow.md) ·
[supply chain](./supply-chain.md) · [license terms](./license-terms.md) ·
[continuity](./continuity.md).

## 1. What Relay is, structurally

Orionfold Relay is a **locally-installed application**, not a SaaS. It
installs from npm (`npx orionfold-relay`), runs a Next.js server bound to
`127.0.0.1` on the operator's machine, and stores all state in a local
SQLite database. The engine is open source (Apache-2.0) in
[github.com/orionfold/relay](https://github.com/orionfold/relay). The
commercial product is premium content packs, unlocked by a signed license
file verified offline.

There is no Orionfold cloud, no Orionfold account, and no server-side
component operated by us in the product's runtime path.

### Relay cell boundary

One running Relay process and its `RELAY_DATA_DIR` form one **Relay cell**.
Customer rows provide attribution and project working directories select
execution context inside that cell; neither is a security boundary. A complete
cell includes its process/container, private port/network and route, data root,
SQLite database, files, identity, secret root, license, logs, resource budget,
backup lineage, and runtime policy.

A device or VM running one or more cells is a **Relay Host**. Every resident
cell trusts the Host administrator, who can inspect or replace it. Use distinct
cells for client isolation. Use separate VMs or machines when clients are
mutually hostile or the Host administrator must not have access. Current Relay
surfaces report the active cell facts; customer-owned Host provisioning and
remote lifecycle management remain planned work, not a shipped security claim.

## 2. We host no customer data

This is the load-bearing claim, so here is its basis:

- **All application state is local.** Projects, tasks, documents, workflow
  runs, usage/cost ledgers, chat history, settings, and licenses live in a
  SQLite file in the operator's data directory. Nothing is synced,
  mirrored, or backed up to us — there is no endpoint to receive it.
- **No telemetry or analytics exists in the codebase.** The in-app
  telemetry and analytics surfaces read the local database only. See the
  ["what never happens" list](./data-flow.md#what-never-happens).
- **AI processing happens under *your* provider accounts.** When agents
  run, prompts and in-scope document content go directly from your machine
  to the model provider you configured (Anthropic, OpenAI, or a local
  Ollama model that never leaves localhost). Orionfold is not in that
  path and cannot see it.
- **What we do hold:** purchase records only — the billing details you give
  Stripe at checkout and the email a license was issued to. That data
  exists on the storefront side (orionfold.com + Stripe), never in the
  product.

Consequence for your compliance review: for product usage there is no data
processing agreement to sign with us, because we process nothing. Your
existing terms with your chosen model providers govern the AI data flow.

## 3. Subprocessors

In the conventional SaaS sense, **none** — there is no service of ours
processing your data. The third parties in the picture, all under your
control or your contract:

| Party | Role | Data | Chosen by |
|---|---|---|---|
| Anthropic / OpenAI | Model APIs your agents call | Prompts, in-scope document content, tool results | You (per task/step/schedule) |
| Ollama (local) | Optional local model runtime | Never leaves your machine | You |
| GitHub | Hosts the repo, releases (build artifacts, SBOMs) | Serves downloads; receives nothing about you but a GET | Us (distribution) |
| npm registry | Package distribution | Standard npm install traffic | Us (distribution) |
| Stripe | Payment processing at purchase | Billing details, at checkout only | Us (storefront) |

## 4. Application security posture

- **Deployment surface:** binds to `127.0.0.1` by default; exposing on a
  LAN requires the explicit `--hostname 0.0.0.0` flag, which prints a
  warning. Relay is designed as a single-operator cockpit; treat network
  exposure as you would any internal tool.
- **Agent governance is built-in, not bolted on:** per-profile tool
  permissions (an agent without web tools cannot reach arbitrary URLs),
  human-approval checkpoints for client-facing output, and a full audit
  trail of agent actions.
- **Plugin containment:** third-party plugins can ship MCP servers, which
  are subprocesses — treat plugin installation as running code.
  `--safe-mode` (or `RELAY_SAFE_MODE=true`) disables plugin MCP servers.
  Plugin content is schema-validated on load.
- **Failure visibility as an engineering rule:** the codebase's standing
  principles are zero silent failures and named error types (see
  `CLAUDE.md` in-repo); the license verifier, artifact downloads, and
  install paths all fail loudly with typed errors.

## 5. Supply-chain integrity (summary)

Full detail: [supply-chain.md](./supply-chain.md).

- npm publishes happen **only** via OIDC trusted publishing from a
  committed GitHub Actions workflow — no npm tokens exist to leak. Every
  release carries a SLSA v1 **provenance attestation**; verify with
  `npm audit signatures`.
- A **CycloneDX SBOM** of the production dependency tree is attached to
  every GitHub Release (from 0.20.0).
- The production server build downloads once per version from GitHub
  Releases and is **sha256-verified before extraction**; a mismatch aborts.
- Versions are **pinnable and never self-update**.

## 6. Licensing privacy

License verification is an offline Ed25519 signature check against public
keys embedded in the open-source verifier
([`src/lib/licensing/verify.ts`](../../src/lib/licensing/verify.ts)). No
activation, no re-validation, no data ever sent to Orionfold; works air-gapped. Expiry never
disables installed content ([license terms](./license-terms.md)).

## 7. Vulnerability disclosure

Report vulnerabilities privately via GitHub's security advisory form:
**[github.com/orionfold/relay/security/advisories/new](https://github.com/orionfold/relay/security/advisories/new)**
(see [`SECURITY.md`](../../SECURITY.md)). Please do not open public issues
for security reports. You'll get an acknowledgment within 72 hours;
confirmed issues ship as ordinary versioned releases with CHANGELOG
disclosure.

## 8. Business continuity

The continuity argument is architectural: Apache-2.0 engine + local data +
offline licenses means our disappearance cannot take your deployment down.
Read the specifics, including the honest edge cases, in
[continuity.md](./continuity.md).
