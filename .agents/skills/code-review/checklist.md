# Code Review Checklist — ainative

This checklist is loaded by the code-review skill at review time. Maintain it independently of the skill logic. Add project-specific items as the codebase evolves.

---

## Pass 1 — Critical (blocks merge)

### SQL & Data Safety
- [ ] All Drizzle raw `sql` uses parameterized values, not template-interpolated column refs
- [ ] No `sql\`...${columnRef}\`` patterns (Drizzle treats these as bound params, matching zero rows)
- [ ] Database writes validate input with Zod schemas at the boundary
- [ ] Migration SQL has corresponding bootstrap CREATE in `src/lib/db/index.ts`

### Race Conditions
- [ ] SQLite operations account for WAL mode (no multi-writer assumptions)
- [ ] Fire-and-forget task execution (202 pattern) handles concurrent status updates safely
- [ ] Scheduler engine tick operations are idempotent

### LLM Trust Boundary
- [ ] Agent SDK `canUseTool` responses are validated before execution
- [ ] LLM-generated content is sanitized before database insertion
- [ ] Tool results from claude-agent.ts are schema-validated before use

### Security
- [ ] API routes check authorization (no open mutation endpoints)
- [ ] File upload paths are sanitized (no path traversal via `~/.ainative/uploads/`)
- [ ] Environment variables (ANTHROPIC_API_KEY) are not exposed to client bundles
- [ ] No raw HTML injection with unsanitized LLM output (use safe rendering methods)

---

## Pass 2 — Informational (non-blocking)

### ainative-Specific Patterns
- [ ] SheetContent body has `px-6 pb-6` padding (recurring issue — see MEMORY.md)
- [ ] Badge variants use status-colors.ts mappings, not hardcoded Tailwind colors
- [ ] New tables have bootstrap CREATE in db/index.ts (not just migration SQL)
- [ ] Drizzle schema.ts stays in sync with migration SQL column additions
- [ ] OKLCH color tokens use hue 250 (blue-indigo), not 280 (violet)
- [ ] Server Components query DB directly; client mutations use API routes

### Test Coverage
- [ ] New agent profiles have corresponding test files
- [ ] API route handlers have at least happy-path tests
- [ ] Database operations test both success and error paths

### Code Islands (ship verification)
- [ ] New modules are actually imported somewhere (not orphaned code)
- [ ] Processor/builder files are wired into their parent systems
- [ ] grep confirms imports exist before marking features complete

---

## How to Update This Checklist

When a bug is found that the checklist would have caught:
1. Add a specific, actionable check item to the appropriate section
2. Reference the MEMORY.md lesson if one exists
3. Keep items concrete ("check X for Y") not vague ("ensure quality")
