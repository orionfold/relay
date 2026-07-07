---
name: code-review
description: "Security-focused code review with 2-pass model. Pass 1 blocks merge (SQL safety, race conditions, LLM trust boundary, security). Pass 2 is informational (dead code, magic numbers, test gaps). Use when reviewing code changes, PRs, or before shipping features. Triggers on 'review code', 'code review', 'check this code', 'is this safe to merge'."
---

# Code Review — 2-Pass Model

Review code changes using a structured 2-pass model. Pass 1 catches merge-blocking issues. Pass 2 surfaces informational findings. Each critical finding uses the one-issue-one-question pattern for clear resolution.

## Setup

1. Load the checklist: read `skills/code-review/checklist.md` (relative to this skill)
2. Identify the changes to review (diff, PR, or staged files)
3. Read all changed files in full (not just the diff — context matters)

## Pass 1: CRITICAL — Blocks Merge/Ship

These findings **must be resolved** before code can merge or ship. Review in this order:

### 1.1 SQL & Data Safety
- String interpolation in SQL queries (must use parameterized queries)
- Missing parameterization in Drizzle raw SQL
- TOCTOU races (time-of-check-time-of-use) in database operations
- Unvalidated data written to database

### 1.2 Race Conditions
- Check-then-set patterns without atomicity guarantees
- Concurrent database access patterns (verify WAL mode awareness for SQLite)
- Shared mutable state across async boundaries
- File system operations without proper locking

### 1.3 LLM Output Trust Boundary
- Agent/LLM output used directly in database writes without validation
- LLM-generated content passed to API calls without sanitization
- Tool call results trusted without schema validation
- Prompt injection vectors in user-controlled content passed to agents

### 1.4 Security (OWASP-aligned)
- XSS: unsanitized user input rendered in HTML/JSX
- Injection: command injection, path traversal, SSRF
- Auth bypass: missing authorization checks on API routes
- Sensitive data exposure: secrets in logs, error messages, or client bundles

### Resolution Pattern

For each Pass 1 finding, use the **one-issue-one-question** pattern:

> **CRITICAL: [Issue Title]**
>
> [Description of the issue with code reference]
>
> **File:** `path/to/file.ts:42`
> **Category:** [SQL Safety | Race Condition | LLM Trust | Security]
>
> Options:
> - **A) Fix now** — [suggested fix]
> - **B) Acknowledge risk** — document why this is acceptable
> - **C) Skip** — false positive, here's why: [explanation needed]

Ask one question at a time. Wait for the user's response before presenting the next finding.

---

## Pass 2: INFORMATIONAL — Non-blocking

Report these findings as a summary list. They do not block merge but should be tracked.

### 2.1 Dead Code & Consistency
- Unreachable code paths, unused imports, orphaned functions
- Inconsistent naming conventions within the change
- Style drift from established codebase patterns

### 2.2 Magic Numbers & String Coupling
- Hardcoded values that should be constants or configuration
- Tightly coupled string literals across files
- Implicit dependencies between modules

### 2.3 Test Gaps
- New code paths without corresponding tests
- Modified behavior without updated tests
- Edge cases visible in the code but not covered by tests

### 2.4 Type Coercion at Boundaries
- API response data used without type narrowing
- Form data or URL params used without validation
- Database query results assumed to have specific shapes

### 2.5 Prompt Quality (for agent-related code)
- Vague or ambiguous system prompts
- Missing output format specifications
- No error handling guidance in prompts

### Informational Output Format

```markdown
## Pass 2 — Informational Findings

| # | Category | File | Finding | Severity |
|---|----------|------|---------|----------|
| 1 | Test Gap | `src/foo.ts:23` | New branch not tested | Low |
| 2 | Magic Number | `src/bar.ts:45` | Hardcoded timeout 5000 | Low |
```

---

## Review Flow

```
1. Load checklist.md
2. Read all changed files (full context)
3. Run Pass 1 checks (critical)
   └─ For each finding: one-issue-one-question → wait for response
4. Run Pass 2 checks (informational)
   └─ Present summary table
5. Final verdict: APPROVE / REQUEST CHANGES
```

## Final Verdict

After all Pass 1 findings are resolved:

- **APPROVE** — no unresolved critical findings, informational items noted
- **REQUEST CHANGES** — unresolved critical findings remain (user chose to skip without explanation)

## Guidelines

- **Read the full file, not just the diff.** Context around the change often reveals issues the diff alone hides.
- **Check the checklist.** The external `checklist.md` may have project-specific items. Load it every time.
- **Err toward false negatives.** A missed real bug is worse than a flagged non-issue, but flooding with false positives erodes trust. When uncertain, flag it as informational (Pass 2), not critical (Pass 1).
- **Respect the Engineering Principles.** Reference AGENTS.md principles by name when a finding relates to one (e.g., "Violates: Zero silent failures").
