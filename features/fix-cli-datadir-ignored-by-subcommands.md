---
title: Fix — `--data-dir` is silently ignored by the pack / license / plugin subcommands
status: planned
priority: P2
milestone: mvp
source: staging P1-verification run 2026-07-03 (found while reproducing fix-pack-install-blueprint-cache)
dependencies: []
---

# Fix: `relay pack add --data-dir X` ignores `--data-dir`

## Description

The global `--data-dir <path>` flag is honored by the default server-launch path
but **silently ignored** by the `pack`, `license`, and `plugin` subcommands. A
customer who runs:

```
relay pack add relay-agency-pro --data-dir ~/.relay-custom
```

installs the pack into the DEFAULT data dir (or whatever `RELAY_DATA_DIR` / an
auto-written `.env.local` resolves to), NOT `~/.relay-custom`. The pack lands
where the server that runs on `--data-dir ~/.relay-custom` never looks — a silent
wrong-location write with no error.

Observed live during the `fix-pack-install-blueprint-cache` staging smoke: `pack
add --data-dir ~/.relay-staging` wrote to `~/.run` (the value an auto-created
`.env.local` in the launch dir had pinned), completely disregarding the flag. The
smoke had to target the dir via the `RELAY_DATA_DIR` env var instead, which the
subcommands DO read.

## Root cause (verified at code)

Ordering bug in `bin/cli.ts`:

- Subcommands are detected by raw `process.argv` inspection and short-circuit
  (`process.exit`) at lines ~193 (`pack`), ~207 (`license`), ~171 (`plugin`) —
  BEFORE `program.parse()` (line ~219).
- `--data-dir` is only mapped to `process.env.RELAY_DATA_DIR` AFTER parse, at
  lines ~224-225 (`if (opts.dataDir) process.env.RELAY_DATA_DIR = opts.dataDir`).
- So when a subcommand short-circuits, the `--data-dir` → `RELAY_DATA_DIR`
  assignment never runs. The subcommand's data-dir resolution
  (`getAinativeDataDir()` → `dataDir()`) reads only `RELAY_DATA_DIR`, which is
  still unset (or set by `.env.local`), and the flag is lost.

The short-circuit itself is intentional (TDR-032 — keep the pack/license
dependency chain out of the default startup graph); it just severed those verbs
from the post-parse flag application.

## Technical Approach

Apply `--data-dir` to `RELAY_DATA_DIR` BEFORE the subcommand short-circuits.
Options, in order of preference:

1. **Pre-scan argv for `--data-dir` at the top**, before the subcommand blocks,
   and set `process.env.RELAY_DATA_DIR` if present (mirroring the pack/license
   CLIs' own `extractFlag` helper in `src/lib/packs/cli.ts`). Minimal, local, and
   keeps the short-circuit intact.
2. Alternatively, have each subcommand's own arg parser (`runPackCommand`,
   `runLicenseCommand`) accept and apply `--data-dir`. More surface, but keeps
   the flag handling co-located with each verb.

Prefer (1) — one pre-parse scan covers all three subcommands and matches the
existing "detect before parse" shape.

Watch the interaction with the first-run `.env.local` auto-write (lines ~43-67):
an explicit `--data-dir` should win over an auto-written `RELAY_DATA_DIR`, so
apply the flag AFTER any `.env.local` load, or skip the auto-write when the flag
is present.

## Verification (real launch smoke)

1. From a scratch dir with NO `RELAY_DATA_DIR` set and NO `.env.local`:
   `relay pack add relay-agency --data-dir /tmp/dd-test` → assert the blueprints
   land in `/tmp/dd-test/blueprints/`, not `~/.relay/`.
2. Repeat with `license add` and confirm the license lands in
   `/tmp/dd-test/licenses/`.
3. Regression: `relay --data-dir /tmp/dd2 --port 3xxx` (server launch) still
   works.
4. Regression: `RELAY_DATA_DIR` env var still honored when no flag is passed.

## Acceptance Criteria

- [ ] `relay pack add <id> --data-dir X` installs into `X`, not the default dir.
- [ ] `relay license add <file> --data-dir X` stores into `X/licenses/`.
- [ ] Explicit `--data-dir` wins over an auto-written `.env.local` RELAY_DATA_DIR.
- [ ] `RELAY_DATA_DIR` env var path unchanged when no flag passed.
- [ ] Server-launch `--data-dir` path unchanged (no regression).

## Scope Boundaries

**Included:** wiring `--data-dir` into the pack/license/plugin subcommand paths
in `bin/cli.ts`. **Excluded:** the two staging fixes this was found alongside
(`fix-packs-ui-install-core-version`, `fix-pack-install-blueprint-cache` — both
shipped). No change to how `dataDir()` resolves, or to the `.env.local`
first-run convenience write beyond the flag-precedence interaction.

## References

- Code: `bin/cli.ts` lines ~168-226 (subcommand short-circuit vs. post-parse
  `--data-dir` application), `src/lib/config/env.ts` `dataDir()`,
  `src/lib/packs/cli.ts` `extractFlag` (the flag-scan helper to reuse).
- Found during: `features/fix-pack-install-blueprint-cache.md` verification.
