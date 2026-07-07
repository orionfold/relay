---
name: worktree-production
description: >
  Manage a production-like ainative instance running in a git worktree for dogfooding.
  Use when the user mentions worktree setup, syncing worktrees with main, running ainative
  in production mode, dogfooding, isolated DB for worktrees, worktree environment setup,
  migration sequencing from feature branches, or seeding a worktree instance. Also triggers
  on "worktree production", "dogfood", "sync worktree", "worktree setup", "production instance",
  or any request to run the app from a worktree with its own database.
---

# Worktree Production

Run a production-like ainative instance in a git worktree while developing on main. This enables **dogfooding** — using ainative to build ainative.

## Architecture

```
~/Developer/ainative/                    ← main (development)
  └── .git/worktrees/                   ← git tracks worktrees here
~/Developer/ainative-worktrees/<name>/   ← worktree (dogfooding)
  └── .git (file, points back to main)

~/.ainative/                             ← main instance data (default)
~/.ainative-dogfood/                     ← worktree instance data (isolated)
```

Git worktrees share one object store (commits, history) but each checkout gets its own working tree. `node_modules/`, `.next/`, `.env.local` are gitignored — each instance needs its own.

## Role Boundaries

| Task | Use this skill | Use instead |
|------|---------------|-------------|
| Set up a dogfooding worktree | Yes | — |
| Sync worktree with latest main | Yes | — |
| Seed sample data in worktree | Yes | — |
| Fix a bug found while dogfooding | Refer to decision tree below | Fix on main, then sync |
| Create a new feature branch | No | `git worktree add` directly |
| Merge completed worktree work | No | `superpowers:finishing-a-development-branch` |
| Clean up stale branches | No | `commit-commands:clean_gone` |
| Check project health | No | `/supervisor` |

## Modes

### 1. Setup Mode

Create and configure a new dogfooding worktree.

**Steps:**

1. **Pre-flight: commit or stash uncommitted changes on main.**
   `git worktree add` snapshots from the last **commit**, not the working directory. If main has unstaged changes, the worktree will get stale code — and cross-file dependencies (e.g., a new export in module A imported by module B) will break at build time.
   ```bash
   cd ~/Developer/ainative
   git status -s                # anything modified?
   # If yes: commit or stash before proceeding
   git add <files> && git commit -m "..." # or: git stash
   ```

2. Create the worktree (if it doesn't exist):
   ```bash
   git worktree add ../ainative-worktrees/<name> -b <branch-name>
   ```

3. Create `.env.local` in the worktree:
   ```env
   STAGENT_DATA_DIR=~/.ainative-dogfood
   PORT=3100
   ANTHROPIC_API_KEY=<copy from main's .env.local>
   ```

4. Install dependencies:
   ```bash
   cd ~/Developer/ainative-worktrees/<name>
   npm install
   ```

5. Start the app and seed data:
   ```bash
   npm run dev
   # In another terminal, or after app starts:
   curl -X POST http://localhost:3100/api/data/seed
   # Or use Settings page > Seed Sample Data button
   ```

**Alternative: use CLI with --data-dir flag:**
```bash
node dist/cli.js --data-dir ~/.ainative-dogfood --port 3100
```

### 2. Sync Mode

Pull latest changes from main into the dogfooding worktree.

**One-command sync:**
```bash
cd ~/Developer/ainative-worktrees/<name>
npm run sync-worktree
```

This runs `bin/sync-worktree.sh` which:
- Stashes uncommitted changes (if any)
- Rebases onto main
- Restores stash
- Runs `npm install` only if `package-lock.json` changed

**Manual sync (if you prefer control):**
```bash
git stash           # if you have uncommitted changes
git rebase main
git stash pop       # restore changes
npm install         # only if package.json changed
```

### 3. Seed Mode

Populate the dogfooding instance with sample data.

**Via API** (requires running server):
```bash
curl -X POST http://localhost:3100/api/data/seed
```

**Via UI**: Settings page > Seed Sample Data button

**Reset + re-seed** (nuclear option):
```bash
# Stop the server first, then:
node dist/cli.js --data-dir ~/.ainative-dogfood --reset --port 3100
# After restart, seed via API or UI
```

## Migration Rules

When adding database migrations from a worktree/feature branch:

1. **During development**: Name new migrations with `XXXX_` prefix
   ```
   XXXX_add_my_feature.sql    ← placeholder number
   ```

2. **At PR time**: Check the highest migration on main and renumber
   ```bash
   ls src/lib/db/migrations/   # find current highest (e.g., 0011)
   # Rename: XXXX_add_my_feature.sql → 0012_add_my_feature.sql
   ```

3. **Update meta journal**: If renumbering, also update `src/lib/db/migrations/meta/_journal.json`

4. **Always add bootstrap**: For new tables, add a `CREATE TABLE IF NOT EXISTS` block in `src/lib/db/bootstrap.ts`. This is the safety net for existing databases that may not run migrations.

5. **Never** commit two migrations with the same sequence number across branches.

**Why**: Multiple worktrees may add migrations concurrently. Drizzle applies migrations in filename order. Conflicting numbers cause "already applied" errors or silent skips. The bootstrap layer (`CREATE TABLE IF NOT EXISTS`) provides a safety net but cannot handle `ALTER TABLE` conflicts.

## Decision Tree: Bug Found While Dogfooding

```
Found a problem while using the worktree instance
        │
        ├─ Blocks my current work?
        │   ├─ Yes → Fix on main (or new branch), rebase worktree, continue
        │   └─ No  → Note it, finish current work first
        │
        ├─ Is it a 2-minute fix?
        │   ├─ Yes → Fix on main directly, then sync
        │   └─ No  → New worktree: git worktree add ../ainative-worktrees/fix-<thing> -b fix/<thing> main
        │
        └─ Does it touch the same files as worktree work?
            ├─ Yes → Expect rebase conflicts after fix merges to main
            └─ No  → Clean rebase, no drama
```

**Key discipline**: Never fix main's bugs on the feature branch. The fix gets trapped behind half-done feature work. Fix on main → the fix ships independently → every worktree benefits on next sync.

## FLOW.md Integration

Dogfooding maps to the **Evaluate** phase running continuously:

| FLOW.md Phase | Dogfooding Equivalent |
|---------------|----------------------|
| Evaluate | Using the app in the worktree, discovering UX issues |
| Ideate | Noting bugs and feature ideas while dogfooding |
| Build | Switching to main to fix issues |
| Verify | Running tests on main after fixes |
| Ship | Merging fix, syncing worktree to pick it up |

## Codex Instance Context

When running Codex in a worktree directory:

- **You are in the dogfooding instance.** Focus on using the app, not modifying source code.
- Report bugs and feature requests — don't fix them here.
- If you must make a quick source fix, commit it on the worktree branch and note it for later PR.
- `features/`, `ideas/`, `wireframes/` are gitignored — they won't sync between instances.

When running Codex in the main directory:

- **You are in the development instance.** Normal FLOW.md lifecycle applies.
- Check if bugs were reported from dogfooding sessions before picking next work.

## Environment Isolation Checklist

| Resource | Main (default) | Worktree |
|----------|---------------|----------|
| Database | `~/.ainative/ainative.db` | `~/.ainative-dogfood/ainative.db` |
| Uploads | `~/.ainative/uploads/` | `~/.ainative-dogfood/uploads/` |
| Blueprints | `~/.ainative/blueprints/` | `~/.ainative-dogfood/blueprints/` |
| Port | 3000 | 3100 |
| node_modules | Own copy | Own copy |
| .next cache | Own copy | Own copy |
| Git objects | Shared (one store) | Shared (one store) |
