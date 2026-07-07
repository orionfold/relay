---
name: defer-ledger
description: Track and audit deliberate shortcuts left in the code as `DEFER:` markers, and harvest them into a debt ledger that flags any deferral without an upgrade trigger as "later means never" rot. Use when the user asks to review tech debt, audit shortcuts/deferrals, run a defer sweep, check the debt ledger, find untriggered deferrals, or after a deliberately-minimal implementation to record what was left out. Triggers on "defer ledger", "debt ledger", "audit deferrals", "what did we punt", "tech-debt sweep", "DEFER markers", "untriggered shortcuts", "later means never".
---

# Defer Ledger

Our engineering principles say to write the **minimum viable solution** (AGENTS.md
principles #5 "Explicit over clever" and #6 "DRY with judgment — extract on third use").
The danger of disciplined minimalism is that a deliberate shortcut silently becomes
permanent *under*-engineering — "later means never." This skill makes those shortcuts
**visible and accountable**: it harvests `DEFER:` markers into a ledger and flags the ones
that have no upgrade trigger, because an untriggered deferral is rot waiting to happen.

Adapted (not adopted) from the `ponytail` project's debt-ledger idea (MIT). The marker
convention, trigger-or-rot rule, and tooling are Orionfold-native. This is a **read-only
audit skill** — it reports; it never edits code on its own.

## The `DEFER:` marker convention

When you deliberately ship a shortcut instead of the full solution, leave a marker on the
line or in a block comment, in this shape:

```ts
// DEFER: <what was shortcut> — UPGRADE WHEN: <named, observable trigger>
```

- **`DEFER:`** — the literal prefix (uppercase). Distinct from `TODO`/`FIXME`, which mean
  "unfinished" or "broken"; `DEFER:` means "this works, but a smaller solution than the
  full one, on purpose."
- **what was shortcut** — one phrase: the corner cut and the fuller solution it stands in
  for. ("in-memory map instead of a real cache", "linear scan; no index yet".)
- **`UPGRADE WHEN:`** — the **upgrade trigger**: a concrete, observable condition that
  should promote the shortcut to the full solution. This is the load-bearing part. A
  marker without it is the rot the ledger exists to catch.

Good (has a trigger):
```ts
// DEFER: linear scan over customers — UPGRADE WHEN: customers table exceeds ~5k rows
const match = all.find((c) => c.slug === slug);
```

Rot (no trigger — flagged by the ledger):
```ts
// DEFER: skip retry on the API write
await writeRow(row);
```

## When to leave a marker (the writer side)

Leave a `DEFER:` only for a shortcut that is **correct now but deliberately smaller** than
the full solution. Always include `UPGRADE WHEN:`. If you can't name a trigger, that is a
signal the shortcut is either (a) actually fine forever — then it needs no marker, just a
normal comment — or (b) under-engineering you shouldn't ship. Don't use `DEFER:` for bugs
(`FIXME`) or for unfinished work (`TODO`).

## When to harvest (the audit side — this skill's main job)

Run when the user asks to audit tech debt / deferrals, before a release, or after a
minimal-by-design implementation. Workflow:

### Step 1 — Harvest every marker

Use `rg` (our search standard), capturing file + line + the marker text. Search the whole
tree minus deps and build output:

```bash
rg -n --no-heading "DEFER:" -g '!node_modules' -g '!dist' -g '!.next' -g '!*.lock'
```

Capture each hit as `{ file, line, text }`. If there are zero hits, say so plainly
("no `DEFER:` markers found — clean ledger") and stop. **Zero silent failures**
(principle #1): an empty result is a real, reported outcome, not nothing.

### Step 2 — Partition by upgrade trigger

For each marker, check whether its text (the marker line plus, for block comments, the
adjacent comment lines) contains an `UPGRADE WHEN:` clause with a non-empty, concrete
condition. Partition into:

- **Tracked** — has a real `UPGRADE WHEN:` trigger. Legitimate deferred debt.
- **Rot** — no `UPGRADE WHEN:`, or a vacuous one ("UPGRADE WHEN: needed", "...later",
  "...someday"). These are the "later means never" risks — the headline of the report.

### Step 3 — Report the ledger

Group **Tracked** by file. Lead the report with the **Rot** list, since that's the
actionable finding. Use a compact table; one line per marker:

```
## Defer Ledger — <N> markers (<R> rot, <T> tracked)

### ⚠ Rot — no upgrade trigger (fix the marker or remove the shortcut)
| Location              | Shortcut                          |
|-----------------------|-----------------------------------|
| src/lib/foo.ts:42     | skip retry on the API write       |

### Tracked — deferred with a trigger
**src/lib/customers/index.ts**
- :88 — linear scan over customers · UPGRADE WHEN: table exceeds ~5k rows
```

End with a one-line verdict: how many markers, how many are rot, and the single most
urgent rot item to address (if any). Do **not** edit code — propose fixes only if asked.

## Scope fences

- **Read-only.** Reports; never mutates code. Fixing a flagged marker is a separate,
  user-directed edit.
- **`DEFER:` only.** Don't fold in `TODO`/`FIXME` — they mean different things; conflating
  them dilutes the signal. (A separate sweep can cover those if asked.)
- **Not a simplifier.** For reuse/dedupe/efficiency cleanups, use `/simplify`. For
  correctness/security, use `/code-review`. This skill only audits *deferred* debt.
