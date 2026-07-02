---
title: "Continuity: what happens if Orionfold disappears"
category: "trust"
lastUpdated: "2026-07-01"
---

# Continuity: what happens if Orionfold disappears

Vendor risk is a fair question to ask of a small company. Relay's answer is
architectural, not contractual: the product is built so that our
disappearance cannot take your workflows, your data, or your purchased
content with it.

## The four guarantees

1. **The engine is Apache-2.0.** The complete application — orchestration,
   governance, schedulers, runtimes, UI, CLI — is open source in
   [this repository](https://github.com/orionfold/relay). You can fork it,
   patch it, and run it indefinitely under the same license, with no
   copyleft obligations on your side.

2. **Your data is a local SQLite file you already possess.** Relay has no
   cloud backend. Projects, tasks, workflows, documents, usage ledgers —
   everything lives in a SQLite database in your data directory, in an
   open format readable by any SQLite client. There is nothing to export
   and no one to request it from, because it never left your machine.

3. **Licenses verify offline, forever.** License verification is an Ed25519
   signature check against public keys embedded in the open-source code
   ([`src/lib/licensing/verify.ts`](../../src/lib/licensing/verify.ts)).
   No activation server exists, so no activation server can be shut down.
   Installed premium packs never re-lock — see
   [License terms](./license-terms.md).

4. **Installed versions keep working.** Nothing in Relay checks for
   updates, sends your data to Orionfold, or depends on an Orionfold-operated
   service at runtime. A version you have installed and run today runs the same on
   the day our domain lapses.

## The honest edge cases

- **First-run of a *new* install** downloads a prebuilt server artifact
  from this repo's GitHub Releases. If GitHub or the repo vanished, the
  npm package still contains the full source — any install can build and
  run from source (`npm run build`), and `RELAY_BUILD_ARTIFACT_URL` points
  installs at your own mirror. Published npm versions remain installable
  regardless — npm's unpublish policy blocks removal of established
  versions, and your lockfile + registry mirror (Verdaccio, Artifactory)
  close the rest of that gap if your policy requires it.
- **Model providers are your relationship, not ours.** Relay orchestrates
  agents against API keys you hold (Anthropic, OpenAI, or a local Ollama
  model at zero external dependency). Our continuity has no bearing on
  those.
- **What you would actually lose** if Orionfold wound down: future pack
  updates, new releases, and support. What you keep: everything you have.
