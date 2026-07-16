---
title: npm 12 First-Run Native Binding Recovery
status: completed
priority: P1
goal: G-011
---

# npm 12 First-Run Native Binding Recovery

## Outcome

A one-off `npx orionfold-relay` install that reaches startup without a usable
`better-sqlite3` native binding diagnoses the dependency before Relay imports
its database graph. Relay performs one visible, package-scoped repair, proves
the repaired binding can open an in-memory SQLite database, and continues. If
that repair fails, startup stops with the named
`BetterSqlite3NativeBindingUnavailableError` and exactly one copy-paste
recovery command:

```text
npx --yes --allow-scripts=better-sqlite3 orionfold-relay@latest
```

Healthy npm 10/11 installs do not run a repair or print preflight output.
Commands that do not need SQLite (`--help`, `--version`, license management,
and plugin confinement dry-run) remain available when the native binding is
broken. Pack management and normal server startup run the preflight before
their first database-bearing dynamic import.

## Design and implementation plan

1. Keep the CLI bootstrap graph free of static `better-sqlite3`, Drizzle,
   migration, and pack imports until the preflight has passed.
2. Probe the real native boundary by opening and closing an in-memory database;
   do not infer health from an npm exit code or a single expected file path.
3. On failure, invoke only `better-sqlite3`'s reviewed install hook in its own
   package directory. Do not alter user/global npm configuration and do not use
   the all-scripts escape hatch.
4. Re-run the probe. A successful child exit without a usable binding remains
   a terminal named failure.
5. Protect the state machine with deterministic unit tests and gate releases
   with an isolated npm 12 tarball install whose project deliberately has no
   install-script approval. Retain the existing npm 11 production smoke.

## Acceptance criteria and regression disposition

- [x] Healthy binding: one probe, no repair, no output.
- [x] Missing/blocked binding: visible diagnosis, one repair, verification
      probe, visible continuation.
- [x] Failed or ineffective repair: named terminal error and one exact recovery
      command; no silent continuation.
- [x] Real bundled CLI reaches the preflight before its database import graph.
- [x] Release workflow runs the isolated npm 12 fixture on an npm-compatible
      pinned Node runtime.
- [x] Existing npm 11 customer production smoke remains a release gate.

## Rescue and rollback

If npm changes explicit lifecycle-script behavior so the scoped self-repair no
longer works, keep the preflight and named error, remove only the repair call,
and retain the approved `npx --allow-scripts=better-sqlite3` recovery command.
The normal healthy path is a single in-memory open/close and can be reverted by
removing the preflight call plus restoring the database imports only after a
replacement early-diagnosis boundary exists.
