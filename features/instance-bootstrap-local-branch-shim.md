---
title: Bootstrap `local` branch as tracking shim, not divergent worktree branch
status: completed
priority: P2
milestone: post-mvp
source: memory/ensureLocalBranch-checkout-bug.md + 2026-04-17 ainative-wealth incident (this session)
dependencies: [instance-bootstrap, upgrade-detection]
---

# Bootstrap `local` branch as tracking shim, not divergent worktree branch

## Description

`ensureLocalBranch()` in [src/lib/instance/bootstrap.ts:34-48](../src/lib/instance/bootstrap.ts:34) creates the bootstrap-managed branch by calling `createAndCheckoutBranch("local")`, which executes `git checkout -b local` ([src/lib/instance/git-ops.ts:55-57](../src/lib/instance/git-ops.ts:55)). Two design properties of that line conspire against the rest of the system:

1. **`-b` switches HEAD onto the new branch.** Whatever branch the user was on is silently abandoned. Domain-clone setups (`PRIVATE-INSTANCES.md` §1.7) explicitly rename `local` → `<domain>-mgr` and expect to stay on `<domain>-mgr` across reboots. Without a workaround, the very next `npm run dev` recreates `local` and yanks HEAD off the domain branch. The current workaround — codified in `PRIVATE-INSTANCES.md` and applied to wealth/venture/growth on 2026-04-07 — is to leave a "dead `local` shim" branch at the same SHA as `<domain>-mgr` so `branchExists("local") === true` and `ensureLocalBranch()` no-ops.

2. **`local` is created at "current HEAD," not as a tracking ref for `origin/main`.** This decision was deliberate (the spec says "create `local` at current HEAD," see [features/instance-bootstrap.md:44](instance-bootstrap.md:44)) and is correct for the *single-clone* case, where `local` IS the working branch. But for the *domain-clone* case, after the §1.7 rename, the dead `local` shim never advances. Worse, when an upstream history rewrite happens — as occurred during the 2026-04-17 legacy repository migration — the orphaned `main` ref accumulates 500+ commits of divergence with `origin/main` because nothing in bootstrap ever tries to fast-forward it.

The downstream symptom landed today in ainative-wealth: the upgrade-detection sidebar badge read **"570 updates"** even immediately after a successful `git merge origin/main` into `wealth-mgr`. The poller computes its count as `git rev-list --count main..origin/main` ([src/lib/instance/git-ops.ts:75-83](../src/lib/instance/git-ops.ts:75)), and local `main` was frozen at the pre-migration HEAD `6f9b3af1` (566 commits unique to it, 570 commits behind upstream — fully orphaned by the history rewrite). Manual `git update-ref refs/heads/main refs/remotes/origin/main` cleared the badge instantly.

This spec proposes treating `local` (and, by extension, `main` on domain clones) as **tracking shims that bootstrap re-points each boot**, not as branches that hold history. The new contract: bootstrap is responsible for keeping the shims aligned with their tracked refs; the user is responsible only for the working branch.

## User Story

As a ainative power user running a domain clone (wealth-mgr / venture-mgr / growth-mgr), I want the upgrade-detection badge in my sidebar to reflect the genuine commits-behind count between my working branch and upstream, so that after a successful merge it reads zero — without me having to remember to also force-update some shim ref that nobody told me existed.

## Technical Approach

### 1. Replace `createAndCheckoutBranch` with `createBranchAt` in `git-ops.ts`

Add a new method that creates a branch at a given ref **without checking it out**. Keep the old method only if other callers exist (none do — `ensureLocalBranch` is the sole caller per `grep ensureLocalBranch src/`).

```ts
// src/lib/instance/git-ops.ts
createBranchAt(name: string, ref: string): void {
  // -f is intentional: this is a shim, we own it. If it exists at a
  // different SHA, repoint it. If it doesn't exist, create it.
  run(["branch", "-f", name, ref]);
},
```

Update the `GitOps` interface in `src/lib/instance/types.ts` accordingly. Remove `createAndCheckoutBranch` from the interface and the implementation once no callers remain.

### 2. Reshape `ensureLocalBranch` into `ensureLocalBranchShim`

```ts
// src/lib/instance/bootstrap.ts
const DEFAULT_BRANCH_NAME = "local";
const SHIM_TRACK_REF = "refs/remotes/origin/main";

export function ensureLocalBranchShim(git: GitOps): EnsureStepResult {
  const upstream = git.revParse(SHIM_TRACK_REF);
  if (!upstream) {
    return {
      step: "local-branch",
      status: "skipped",
      reason: "no_upstream_main",
    };
  }
  const current = git.revParse(`refs/heads/${DEFAULT_BRANCH_NAME}`);
  if (current === upstream) {
    return { step: "local-branch", status: "skipped", reason: "shim_aligned" };
  }
  try {
    git.createBranchAt(DEFAULT_BRANCH_NAME, SHIM_TRACK_REF);
    return {
      step: "local-branch",
      status: "ok",
      reason: current === null ? "created" : "repointed",
    };
  } catch (err) {
    return {
      step: "local-branch",
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
```

Three observable behavior changes vs. today:

1. **HEAD never moves.** No more silent branch swap. The §1.7 dead-shim workaround becomes redundant (but keep it documented for back-compat with existing setups — see Migration below).
2. **The shim re-aligns to `origin/main` on every boot.** Orphaned `main`/`local` refs after a history rewrite get auto-healed within one boot cycle.
3. **`origin/main` must already be fetched.** This is fine: `upgrade-poller.ts` runs `git fetch origin main` once per hour and once on boot ([src/lib/instance/upgrade-poller.ts:75](../src/lib/instance/upgrade-poller.ts:75)). The `no_upstream_main` skip path covers fresh checkouts that haven't fetched yet — they'll heal on the next boot after the poller runs.

### 3. Also re-shim `main` on domain clones

When `settings.instance.branchName` is something other than `main` (i.e. the user has run §1.7), bootstrap should additionally re-point `main` at `origin/main`. This is the fix for today's specific incident: the wealth clone's `main` was orphaned and the badge couldn't clear.

```ts
// in ensureInstance(), after ensureLocalBranchShim:
const config = getInstanceConfig();
if (config && config.branchName !== "main" && git.branchExists("main")) {
  // Domain clone — main is a tracking shim too.
  steps.push(ensureMainShim(git));
}
```

`ensureMainShim` is structurally identical to `ensureLocalBranchShim` but with `name = "main"`. Factor both through a shared helper.

**Safety check:** before repointing `main`, verify the user is not currently checked out on it (`git.getCurrentBranch() !== "main"`). If they are, skip with `reason: "main_is_current_branch"` and emit a notification suggesting they switch back to their domain branch. We never repoint a checked-out branch — that would change the working tree.

### 4. Wire into the existing rebase-in-progress guard

The current guard at [bootstrap.ts:232](../src/lib/instance/bootstrap.ts:232) already short-circuits `ensureLocalBranch` if a rebase is in progress. Keep that guard for both shim functions.

## Acceptance Criteria

1. After deletion of `.git/refs/heads/local` followed by a fresh boot, `local` exists at the same SHA as `origin/main`. HEAD is unchanged from before the delete-and-boot.
2. After deletion of `.git/refs/heads/main` (simulating an aggressive cleanup) followed by a fresh boot **on a domain clone**, `main` exists at the same SHA as `origin/main`. HEAD is unchanged.
3. On a domain clone where `main` is divergent from `origin/main` (the today's-incident case), one boot cycle auto-heals it: `git rev-list --count main..origin/main` reads zero. The upgrade-detection badge clears within the next poll tick.
4. The `PRIVATE-INSTANCES.md` §1.7 dead-`local` shim workaround is no longer required. Setups that retain the shim continue to work (idempotent — `branchExists("local")` is true and the SHA-equality check makes the bootstrap step a no-op).
5. No `git checkout` calls remain in `bootstrap.ts` or `git-ops.ts`. (HEAD-moving operations are off-limits to bootstrap.)
6. Single-clone setups (where `branchName === "main"` and the user works directly on the bootstrap-created `local`) continue to work: `local` is created at `origin/main` on first boot and stays there. The single-clone user still has the option of `git checkout local` themselves to start working on it.

## Test Matrix

Add to [src/lib/instance/__tests__/bootstrap.test.ts](../src/lib/instance/__tests__/bootstrap.test.ts):

- *Fresh clone, `local` absent, `origin/main` fetched:* `ensureLocalBranchShim` creates `local` at `origin/main`. HEAD unchanged.
- *`local` exists at correct SHA:* `ensureLocalBranchShim` returns `skipped: "shim_aligned"`. No git mutation.
- *`local` exists at WRONG SHA (divergent):* `ensureLocalBranchShim` repoints. Returns `ok: "repointed"`. HEAD unchanged.
- *`origin/main` not yet fetched:* `ensureLocalBranchShim` returns `skipped: "no_upstream_main"`.
- *Domain clone, `main` orphaned 500+ commits:* `ensureMainShim` repoints `main` to `origin/main`. `git rev-list --count main..origin/main` is now `0`.
- *Domain clone, currently checked out on `main`:* `ensureMainShim` skips with `reason: "main_is_current_branch"`. No mutation.
- *Rebase in progress:* both shim functions skipped. No mutation.

## Migration

No data migration. The behavior change is purely in bootstrap; no settings schema changes, no DB migrations.

**Existing private instances** (the three flagged in `memory/ensureLocalBranch-checkout-bug.md` line 24): keep their dead `local` shim as-is. With the new code, the shim becomes redundant but harmless. After the first boot under the new code, both `local` AND `main` will be re-pointed to `origin/main` automatically.

**`PRIVATE-INSTANCES.md` §1.7** — drop the `git branch local <domain>-mgr` line from new-clone instructions once this ships. Add a note that the line is no longer required for ainative versions ≥ X.Y.Z. Don't ask existing users to delete their shim — leave it as a no-op.

## Out of Scope

- Auto-merging `origin/main` into the working branch. That's the user's call (and the job of the upgrade-session UI). Bootstrap only manages the shims that tell the upgrade poller "yes, you have new commits to consider."
- Renaming `local` → `<domain>-mgr` automatically. The §1.7 user-driven rename pattern stays. Domain-clone setup is intentionally a manual ritual.
- Any change to the pre-push hook or the `pushRemoteBlocked` settings flow. Phase B is unaffected.

## Adjacent risk worth a follow-up spec

Bootstrap has no opinion about the **URL** behind the `origin` remote — it only names the remote. Users who cloned before the 2026-04-17 repository migration can still have `origin` pointing at a retired URL. A one-shot bootstrap step `ensureOriginCanonical()` could read `git remote get-url origin`, compare it against an allowlist of known-good upstream URLs, and emit a notification ("Your `origin` remote points at a retired URL. Update with `git remote set-url origin https://github.com/orionfold/relay.git`?") if it doesn't match. **Not folded into this spec** — keep this one focused on the shim issue. File as its own feature when convenient.

## Verification (post-merge, before declaring done)

```bash
# In a domain clone with a stale main and stale local:
cd ~/Developer/ainative-wealth
git update-ref refs/heads/main 6f9b3af1   # simulate the orphaned state
git update-ref refs/heads/local 6f9b3af1
git rev-list --count main..origin/main    # expect non-zero (e.g. 570)

# Boot the dev server once:
npm run dev   # ctrl-c after instrumentation logs the bootstrap result

# Re-check:
git rev-list --count main..origin/main    # expect 0
git rev-parse local                       # expect == origin/main SHA
git rev-parse main                        # expect == origin/main SHA
git branch --show-current                 # expect wealth-mgr (unchanged)
```

Open the app, verify the sidebar upgrade badge clears (or hit `POST /api/instance/upgrade/check` to skip waiting for the 5-min refetch).

## Verification run — 2026-04-17

Smoke against ainative-wealth (production-mode bootstrap, no dev-mode gates):

1. **Pre-flight:** ainative-wealth on `wealth-mgr`, `main` and `origin/main` both at `a7957e11` after the morning's manual `git update-ref` fix.
2. **Repro:** `git update-ref refs/heads/main 6f9b3af1` — re-orphaned main to the pre-migration history SHA. Verified `git rev-list --count main..origin/main == 570` and `origin/main..main == 566` (exact reproduction of the morning's "500+ updates" badge state).
3. **Apply worktree changes:** tarred `bootstrap.ts` / `git-ops.ts` / `types.ts` from the `loving-buck-fb4fec` worktree into ainative-wealth.
4. **Boot:** `PORT=3010 npm run dev`. Instrumentation-node.ts → `ensureInstance()` ran normally (dev-mode gates off on ainative-wealth).
5. **Post-boot git state:**
   - `git rev-parse main` → `a7957e11...` (re-aligned by `ensureMainShim` from the orphan `6f9b3af1`)
   - `git branch --show-current` → `wealth-mgr` (HEAD did not move)
   - `git rev-list --count main..origin/main` → `0` at shim time. (Upgrade-poller's later fetch advanced origin/main to `739f42a9` — the legitimate 0.11.2 upgrade that landed upstream after the morning's sync — so the steady-state count became `1`.)
6. **API check:** `GET /api/instance/upgrade/status` returned:
   ```json
   {
     "devMode": false,
     "localMainSha": "a7957e11...",
     "lastUpstreamSha": "739f42a9...",
     "commitsBehind": 1,
     "upgradeAvailable": true,
     "pollFailureCount": 0,
     "lastPollError": null
   }
   ```
   The `commitsBehind: 1` is the genuine new upstream release — the 570-orphan is gone.
7. **No startup errors** in dev-server output: no `ReferenceError`, no `Cannot access ... before initialization`, no bootstrap throws.
8. **Cleanup:** `git checkout HEAD -- src/lib/instance/{bootstrap,git-ops,types}.ts` restored ainative-wealth to its committed state. Dev server stopped. `main` was left at the shim-aligned SHA (the new contract — main is a tracking shim, bootstrap owns it).

Fix verified end-to-end. Shim auto-heals a 500+-commit orphaned `main` within one boot cycle, with zero user intervention and zero HEAD movement.
