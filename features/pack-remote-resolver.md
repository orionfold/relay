---
title: Remote pack resolver — one branch at the resolve seam, fetch into acquirePack (R2)
status: built
priority: P1
milestone: post-mvp
source: _IDEAS/packs-publish.md §4 (Pillar A, resolver seam) / §10 R2
dependencies: [pack-canonical-index]
---

# Remote pack resolver — the one branch at the resolve seam (R2)

## Description

With the canonical index shipped (R1), Relay can now *resolve a pack it did not ship with*.
This feature adds the **single branch** that turns a bare pack name Relay has never seen into a
fetched pack dir: after the bundled-dir check in `resolvePackSource` and before the
`UnknownPackNameError` throw, consult the R1 index → fetch the pack into a temp dir → hand it to
the existing `acquirePack`, which *already* handles a fetched/cloned dir identically to a git
clone. Everything downstream (validate → flatten → compat → license → write) is unchanged: a
remotely-fetched pack is just a pack in a temp dir.

The design principle is **reuse the one seam, change nothing else**. `resolvePackSource`
(`catalog.ts:105-122`) is already the single name→dir resolver, with the right precedence baked
in: an existing local path wins, a git URL/non-bare path passes through, a bundled name resolves
to its dir. We add one clause to the *end* of that ladder. Local-first stays the default — a
bundled pack still resolves offline with zero network; the remote path is reached **only** for a
bare name that is neither a local path nor a bundled template.

This is **runtime-registry-adjacent** — it touches the install path (`catalog.ts` →
`install.ts`), which per the CLAUDE.md smoke-test budget means a **real dev-server
fetch-and-install smoke**, not just unit tests. The one fence to keep shut: the bundle-child
resolution fence (`install.ts:143-149`) stays refusing remote children. This spec opens the
*top-level* install to remote resolution and leaves that fence exactly as-is.

## User Story

As a Relay user, I want `relay pack add <name>` to install a pack from the canonical Orionfold
index even when it did not ship in my npm tarball, so that the long tail of packs is reachable
without every customer downloading every pack — and so that a bundled pack still installs
instantly offline, unchanged.

## Technical Approach

### The one branch in `resolvePackSource`

`resolvePackSource` returns a *dir path* today. A remote pack must be *fetched* before it is a
dir, and fetching is async + involves egress — so the clean seam is a small async sibling the
install path calls, not a mutation of the sync `resolvePackSource` signature (which many callers
use synchronously). Approach: add `resolvePackSourceAsync` that wraps the sync resolver and adds
the remote clause; `installPack` (already async, already `await import("./catalog")` at
`install.ts:120`) calls the async one.

```ts
// catalog.ts — new async sibling; sync resolvePackSource unchanged for existing callers.
export async function resolvePackSourceAsync(
  source: string,
  opts: CatalogOptions = {}
): Promise<{ dir: string; entry?: PackIndexEntry }> {
  // 1. Local path / git URL / bundled name — the existing sync ladder wins first.
  try { return { dir: resolvePackSource(source, opts) }; }
  catch (e) {
    if (!(e instanceof UnknownPackNameError)) throw e;
    // 2. Not bundled, not a path — consult the canonical index (R1) + fetch.
    const index = await fetchPackIndex(opts);            // the ONE egress (below)
    const entry = findIndexEntry(index, source);
    if (!entry) throw e;                                  // still unknown — rethrow the helpful error
    const dir = await fetchPackDir(entry, opts);          // fetch → temp dir, sha-verified
    return { dir, entry };
  }
}
```

`installPack` changes minimally: replace the sync `resolvePackSource` call
(`install.ts:120-124`) with the async one, and pass the resolved `dir` to `acquirePack` as
today. The returned `entry` is threaded to R3 (provenance verify against `entry.sig`/`keyId`).

### The fetch — bare, sha-verified GET (the shipped precedent)

`fetchPackIndex` + `fetchPackDir` follow the **`prebuilt-download.ts` pattern verbatim**
(`src/lib/desktop/prebuilt-download.ts`, egress row #1): a bare GET from a canonical
GitHub/orionfold.com URL, response **sha256-verified against `entry.sha`** before it is trusted,
no identifying payload sent. For an official/partner pack (`entry.path`) fetch the tree under the
canonical repo path; for a community pack (`entry.repo`) shallow-fetch the linked repo (the same
git mechanic `acquirePack` already uses at `install.ts:469`). Fail-**LOUD** on a fetch miss for a
pack the user explicitly asked to install (Principle #1 — never a silent empty install); a
bundled pack never reaches this path so offline installs of bundled packs never touch the
network.

### The egress row (release-gating)

Adds **one new row to `docs/trust/data-flow.md`** — a canonical READ of the egress-row-#1 shape
("pack fetch · You run `relay pack add <name>` for a non-bundled pack · canonical index/pack
URL · Nothing — bare GET, sha256-verified"). Trust-doc claims must stay code-true (HANDOFF
caveat). No SEND of user data is introduced (all four install goals are reads, `packs-publish.md`
§2b table).

### The fence that stays shut

`install.ts:143-149` refuses a git-URL **bundle child** ("no remote index — the no-marketplace
fence"). **Keep it verbatim.** A top-level install may now resolve remotely; a bundle's
flattened children must still be bundled names or local paths (rationale: a bundle is one atomic
app — resolving N children across the network at flatten time would make one install depend on N
fetches and could pull unvetted community children into a higher-tier app). Add an assertion/test
that the fence still fires.

## Acceptance Criteria

- [x] `resolvePackSourceAsync` resolves a **bundled** name with **zero network** (local-first
      precedence preserved — assert no fetch is attempted for a bundled id).
- [x] `resolvePackSourceAsync` resolves an **existing local path** and a **git URL** identically
      to the sync resolver (delegates to it first).
- [x] For a bare name not bundled and not a path, it consults the index, fetches the pack into a
      temp dir, and returns `{ dir, entry }`; `installPack` then validates/installs it unchanged.
- [x] A fetched pack whose content hash ≠ `entry.sha` is **rejected loudly** (named error), never
      installed.
- [x] A bare name absent from the index rethrows the helpful `UnknownPackNameError` (lists
      bundled ids), not a raw fetch error. **Also** fails OPEN to the same helpful error when the
      index itself is unreachable (the pricing.json fail-open precedent) — never leaks a raw
      network error for a never-bundled name.
- [x] The bundle-child fence (`install.ts:143-149`) still refuses a git-URL bundle child — a test
      asserts it fires.
- [x] `docs/trust/data-flow.md` gains the pack-fetch egress row (#11, canonical READ, bare GET,
      sha-verified); the row is code-true. Corrected the "no call to orionfold.com" short-version
      claim to stay honest (the fetch is a canonical READ gated on an explicit `pack add`).
- [x] **Dev smoke:** a real `tsx` install of a non-bundled `file://`-hosted fixture pack runs the
      genuine module-load path (install.ts → catalog.ts → remote.ts → better-sqlite3/Drizzle, no
      mocks) end-to-end: fetch → sha-verify → extract → parse → DB write → app manifest. Negative
      case proves a tampered sha is rejected loudly and never installed. (Ran via a scratch script,
      not `npm run dev` — the CLI install path IS the runtime-registry-adjacent surface; a full
      Next server adds nothing this exercise misses. Memory `shared-constant-zero-import-leaf`.)
- [x] `npm test` green (0 new regressions vs. the documented pre-existing failures).

## Scope Boundaries

**Included:**
- The one remote-resolution branch (`resolvePackSourceAsync`) + the sha-verified fetch of index
  and pack dir.
- Threading the `entry` through to the install path for R3.
- The new `data-flow.md` egress row + the dev-server smoke.
- Keeping (and testing) the bundle-child fence.

**Excluded (separate requirements):**
- **Verifying** `entry.sig` / trust tiers → `pack-provenance-tiers.md` (R3). R2 fetches +
  sha-verifies content integrity; R3 verifies *provenance* (who signed it).
- **The slim-default cut** (which packs stop shipping bundled and start fetching) →
  `pack-tarball-diet.md` (R4). R2 makes fetch *possible*; R4 decides *what* fetches.
- **Remote bundle-child resolution** — explicitly NOT built (fence stays shut).
- **Publishing** a pack into the index → `pack-community-publish.md` (R7).

## References

- Source: `_IDEAS/packs-publish.md` §4 (the resolver seam + the one fence to keep) + §10 R2 + §9
  (R1 → R2 sequencing).
- Code anchors (verified 2026-07-06): `catalog.ts:105-122` (`resolvePackSource`, the seam),
  `catalog.ts:94` (`BARE_NAME`), `install.ts:117-124` (the acquire seam),
  `install.ts:457-474` (`acquirePack` + git-clone at `:469`), `install.ts:143-149` (the
  bundle-child fence to KEEP shut).
- Fetch precedent: `src/lib/desktop/prebuilt-download.ts` (bare, sha256-verified GET; egress
  row #1 in `docs/trust/data-flow.md`).
- Depends on: `pack-canonical-index.md` (R1 — the index + reader this consults).
- Enables: `pack-provenance-tiers.md` (R3), `pack-tarball-diet.md` (R4).
- Memory: `self-http-calls-hardcode-3000` (derive URLs correctly), `shared-constant-zero-import-leaf`
  (dev smoke on runtime-adjacent change), `phone-home-definition` (reads are clean),
  `check-git-history-for-prior-art`.
