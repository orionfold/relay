---
title: Filesystem Skill Discovery Reliability Plan
status: completed
goal: G-123
specification: features/runtime-first-value-reliability.md
---

# Filesystem Skill Discovery Reliability Plan

## Goal contract

**Outcome:** valid fused profiles remain available when individual filesystem
skill entries are dangling, unreadable or malformed, while production output
contains at most one privacy-safe summary and a total scanner failure remains a
named error.

**Constraints:** Preserve registry/user/project precedence, valid symlinked
skills, profile IDs and project roots. Routine output must not disclose
absolute paths. Detailed paths require an explicit diagnostics request.

**Verification:** Deterministic fixtures for valid and dangling symlinks,
unreadable content, malformed frontmatter, mixed directories, absent roots,
named root failure, warning aggregation/redaction and explicit diagnostic path
inclusion; focused chat-profile and real workflow CLI smoke.

**Operator gates:** None.

**Stop/rescue:** If filesystem symlink behavior varies by platform, classify
with `lstat`/resolved-target operations and keep unsupported entries in one
named summary rather than weakening valid-symlink support.

## Vertical slices

1. Classify per-entry failures and continue returning valid profiles.
2. Aggregate a bounded, redacted diagnostic report and deduplicate routine
   warnings.
3. Add an authenticated application diagnostics endpoint whose default output
   is redacted and whose explicit `includePaths=1` mode includes local paths.
4. Prove profile-tool and real workflow execution remain usable.

## Regression budget

- Expand the fused-profile unit suite across the failure matrix.
- Add diagnostics endpoint tests for redaction and explicit path inclusion.
- Run profile tool regressions, TypeScript, production build and a real runtime
  workflow smoke.

## Rescue and rollback

Diagnostics are process-local and do not alter skill files or profile storage.
The endpoint and aggregation layer can be removed without data migration; the
scanner can revert independently.
