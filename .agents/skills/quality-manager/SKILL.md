---
name: quality-manager
description: Quality assurance orchestrator for testing strategy, test creation, coverage tracking, code review, regression guarding, and browser-based feature evaluation. Use this skill when the user mentions setting up testing, writing tests, checking coverage, code review, quality audit, regression check, "safe to ship", evaluating features in browser, verifying acceptance criteria, or testing strategy. Also triggers on "set up vitest", "write tests for", "what's our coverage", "quality check", "run tests", "evaluate features", "verify in browser", "test the UI", or any request involving test infrastructure, test creation, or quality assurance workflows. Do NOT use for building components (use frontend-design), creating feature specs (use product-manager), or UX review (use frontend-designer).
---

# Quality Manager

Quality assurance orchestrator that bridges product specs to verified, tested software. Ensures every feature has traceable test coverage, code passes review, and shipped features actually work in the browser.

## Role Boundaries

| Need | Skill | Not This Skill |
|------|-------|----------------|
| "Write tests for the task API" | `quality-manager` | — |
| "Set up vitest" | `quality-manager` | — |
| "What's our test coverage?" | `quality-manager` | — |
| "Code review this PR" | `quality-manager` (delegates) | `code-review` directly |
| "Safe to ship?" | `quality-manager` | — |
| "Evaluate features in browser" | `quality-manager` | `frontend-designer` |
| "Build me a component" | `frontend-design` | `quality-manager` |
| "Review the UX" | `frontend-designer` | `quality-manager` |
| "Create a feature spec" | `product-manager` | `quality-manager` |

## Workflow Detection

Determine which mode to run based on user intent and current state:

### 1. Testing Strategy Setup
**Trigger:** No `vitest.config.ts` exists, OR user asks to "set up testing" / "configure tests" / "add vitest".
Install and configure the test stack from scratch.

### 2. Test Creation
**Trigger:** User asks to "write tests for X" / "test this component" / "add tests".
Derive tests from feature specs and code analysis.

### 3. Coverage Report
**Trigger:** User asks "what's our coverage?" / "coverage report" / "test gaps".
Run coverage analysis and report gaps by priority tier.

### 4. Quality Audit
**Trigger:** User asks for "code review" / "quality check" / "quality audit".
Orchestrate code review + coverage check + acceptance criteria verification.

### 5. Regression Guard
**Trigger:** User asks "safe to ship?" / "regression check" / there are uncommitted changes to tested features.
Git-diff-scoped test run to detect untested changes.

### 6. Feature Evaluation
**Trigger:** User asks to "evaluate features in browser" / "verify in browser" / "test the UI" / "check features visually".
Browser automation to verify released features against product specs and design requirements.

---

## Testing Strategy Setup Mode

When no test infrastructure exists, bootstrap the full stack.

### Step 1: Install Dependencies

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitest/coverage-v8 jsdom
```

### Step 2: Create Vitest Config

Create `vitest.config.ts` at project root:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/components/ui/**',
        'src/test/**',
        'src/**/__tests__/**',
        'src/**/*.d.ts',
        'src/app/layout.tsx',
        'src/app/global-error.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### Step 3: Create Test Setup File

Create `src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest'
```

### Step 4: Add Test Scripts to package.json

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

### Step 5: Create Seed Test

Create a simple sanity test to verify the setup works:

```typescript
// src/lib/__tests__/setup-verify.test.ts
import { describe, it, expect } from 'vitest'

describe('Test Setup', () => {
  it('should run tests successfully', () => {
    expect(true).toBe(true)
  })
})
```

### Step 6: Verify

Run `npm test` to confirm the setup works. Report results to user.

---

## Test Creation Mode

Derive meaningful tests from feature specs and code analysis.

### Process

1. **Read the target code** — Understand the module's API, dependencies, and edge cases
2. **Check for feature specs** — Read `features/*.md` acceptance criteria related to this code
3. **Design test cases** — Map acceptance criteria to test cases; add edge cases the spec didn't cover
4. **Write tests** — Create test file in `__tests__/` subdirectory adjacent to the source
5. **Run and verify** — Execute the tests, fix any failures

### File Placement Convention

Tests live in `__tests__/` subdirectories next to their source:

```
src/
  lib/
    agents/
      Codex-agent.ts
      __tests__/
        Codex-agent.test.ts
    db/
      schema.ts
      __tests__/
        schema.test.ts
  components/
    tasks/
      task-card.tsx
      __tests__/
        task-card.test.tsx
  app/
    api/
      tasks/
        [id]/
          execute/
            route.ts
            __tests__/
              route.test.ts
```

### Test Structure Guidelines

- **Describe blocks** mirror the module's public API or component behavior
- **Test names** describe the expected behavior, not the implementation: `"returns 404 when task not found"` not `"tests the error branch"`
- **Arrange-Act-Assert** pattern for each test
- **Mock external dependencies** (database, APIs, file system) — never hit real services
- **Test public interfaces** — avoid testing private implementation details

### Feature-Spec-Driven Test Derivation

When `features/*.md` files exist, read their acceptance criteria:

```markdown
## Acceptance Criteria
- [ ] User can create a task with title and description
- [ ] Created task appears in the task list immediately
- [ ] Task creation fails gracefully with validation errors
```

Each criterion becomes at least one test case:

```typescript
describe('Task Creation', () => {
  it('creates a task with title and description', async () => { /* ... */ })
  it('shows the new task in the list immediately', async () => { /* ... */ })
  it('displays validation errors for invalid input', async () => { /* ... */ })
})
```

Track which criteria have tests and which don't. Flag untested criteria in the output.

### Test Creation Output

```markdown
## Tests Created: [Module/Component Name]

### Test File
`src/[path]/__tests__/[name].test.ts`

### Test Cases ([N] total)
| Test | Source | Status |
|------|--------|--------|
| [test name] | [acceptance criterion or edge case] | pass/fail |

### Acceptance Criteria Coverage
- [x] [Criterion with test]
- [ ] [Criterion without test — reason]

### Run Results
- **Passed:** N
- **Failed:** N
- **Skipped:** N
```

---

## Coverage Report Mode

Run coverage analysis and report gaps organized by priority tier.

### Coverage Tiers

| Tier | Target | Scope | Rationale |
|------|--------|-------|-----------|
| **Critical** | 90%+ | Validators, schema, constants | Data integrity — bugs here corrupt state |
| **High** | 75%+ | Agents, API routes, business logic | Core functionality — bugs here break features |
| **Medium** | 60%+ | React components, hooks | UI correctness — bugs here degrade UX |
| **Excluded** | — | shadcn/ui components, types, config | Generated/declarative code — testing adds no value |

### Process

1. **Run coverage** — Execute `npm run test:coverage`
2. **Parse results** — Read the coverage output
3. **Classify by tier** — Map each file to its coverage tier
4. **Identify gaps** — Files below their tier target
5. **Prioritize gaps** — Critical gaps first, then High, then Medium
6. **Report** — Produce the coverage report

### Coverage Report Output

```markdown
## Coverage Report

### Summary
| Metric | Current | Target |
|--------|---------|--------|
| Statements | X% | — |
| Branches | X% | — |
| Functions | X% | — |
| Lines | X% | — |

### By Tier

#### Critical (target: 90%+)
| File | Statements | Branches | Functions | Status |
|------|-----------|----------|-----------|--------|
| [file] | X% | X% | X% | pass/gap |

#### High (target: 75%+)
| File | Statements | Branches | Functions | Status |
|------|-----------|----------|-----------|--------|
| [file] | X% | X% | X% | pass/gap |

#### Medium (target: 60%+)
| File | Statements | Branches | Functions | Status |
|------|-----------|----------|-----------|--------|
| [file] | X% | X% | X% | pass/gap |

### Priority Gaps
1. [File] — [current]% vs [target]% — [what's untested]
2. [File] — [current]% vs [target]% — [what's untested]

### Recommendations
- [Highest-impact tests to write next]
```

---

## Quality Audit Mode

Full quality check combining code review, coverage, and acceptance criteria verification.

### Process

1. **Delegate code review** — Invoke the `code-review:code-review` skill for static analysis and code quality issues
2. **Run coverage check** — Execute Coverage Report Mode (above)
3. **Check acceptance criteria** — Read `features/*.md` files, identify criteria for completed/in-progress features, verify test coverage exists for each
4. **Compile audit report** — Combine all findings into a single report

### Audit Output

```markdown
## Quality Audit Report

### Code Review
[Summary from code-review:code-review delegation — key findings only]

### Coverage Status
[Summary from Coverage Report Mode — tier status and top gaps]

### Acceptance Criteria Traceability
| Feature | Total Criteria | Tested | Untested | Coverage |
|---------|---------------|--------|----------|----------|
| [name] | N | N | N | X% |

### Untested Acceptance Criteria
- **[Feature]**: [Criterion] — no test found
- **[Feature]**: [Criterion] — no test found

### Overall Assessment
- **Ship readiness:** [Ready / Needs work / Not ready]
- **Top risks:** [List of highest-priority gaps]
- **Recommended actions:** [Ordered list of what to fix first]
```

---

## Regression Guard Mode

Git-diff-scoped quality check for pre-ship confidence.

### Process

1. **Get changed files** — Run `git diff --name-only HEAD~N` (or vs main branch) to identify changed source files
2. **Map to test files** — For each changed source file, find its corresponding `__tests__/` test file
3. **Identify untested changes** — Changed files with no corresponding test file, or test files that haven't been updated
4. **Run scoped tests** — Execute only tests related to changed files: `npx vitest run --reporter=verbose [test files]`
5. **Check feature spec coverage** — If changed files relate to features with acceptance criteria, verify criteria have tests
6. **Report** — Produce regression guard report

### Regression Guard Output

```markdown
## Regression Guard Report

### Changed Files
| File | Has Tests | Tests Updated | Test Result |
|------|-----------|---------------|-------------|
| [file] | yes/no | yes/no | pass/fail/— |

### Untested Changes (Risk Areas)
- **[file]** — [what changed, why it needs tests]

### Test Results
- **Passed:** N
- **Failed:** N
- **Skipped:** N

### Verdict
- **Safe to ship:** [Yes / No / Conditional]
- **Conditions:** [What must be done before shipping, if conditional]
- **Risks:** [Known risks if shipping without addressing gaps]
```

---

## Feature Evaluation Mode

Browser-based verification of released features against product specs and design requirements.

### Prerequisites

- The app must be running locally (typically `npm run dev` on `localhost:3000`)
- Before starting, kill stale Node/Next.js processes to avoid hangs: `pkill -f "next-server"` and check `lsof -i :3000`
- Chrome with Codex-in-chrome extension, OR Playwright MCP as fallback

### Browser Tool Strategy

1. **Primary: Codex in Chrome** — retry once if first connection fails (usually works on retry)
2. **Fallback: Playwright MCP** — if Chrome extension is unavailable or keeps disconnecting, use `mcp__plugin_playwright_playwright__browser_navigate` and `mcp__plugin_playwright_playwright__browser_snapshot` for equivalent accessibility tree snapshots
3. **Last resort: curl + code tracing** — verify API responses via curl, trace UI code against specs

### Process

1. **Gather specifications**
   - Read `features/*.md` — extract acceptance criteria for completed/in-progress features
   - Read `/frontend-designer` recommendations if available — UX criteria, interaction patterns, visual hierarchy expectations
   - Read `/taste` metrics if configured — design system requirements, visual quality standards

2. **Start browser session**
   - Call `mcp__claude-in-chrome__tabs_context_mcp` to check current browser state
   - If extension not connected, retry once. If still failing, switch to Playwright MCP
   - Navigate to the app (create new tab if needed via `mcp__claude-in-chrome__tabs_create_mcp`)
   - Call `mcp__claude-in-chrome__read_page` to verify the app is loaded

3. **Evaluate each feature**
   For each feature with acceptance criteria:
   - Navigate to the relevant page/view
   - Use `mcp__claude-in-chrome__read_page` to capture the current state
   - Use `mcp__claude-in-chrome__find` to locate specific UI elements
   - Use `mcp__claude-in-chrome__form_input` and `mcp__claude-in-chrome__computer` to test interactions
   - Use `mcp__claude-in-chrome__javascript_tool` to check for console errors or verify DOM state
   - Use `mcp__claude-in-chrome__read_console_messages` to catch runtime errors
   - Compare actual UI behavior against acceptance criteria

4. **Check design compliance**
   - Verify visual hierarchy matches `/frontend-designer` recommendations
   - Check state completeness (loading, empty, error, populated states)
   - Verify interaction patterns work as specified
   - Check accessibility basics (keyboard navigation, focus management)

5. **Record evidence** (optional)
   - Use `mcp__claude-in-chrome__gif_creator` to record multi-step interactions
   - Capture screenshots of issues for the report

6. **Produce evaluation report**

### Feature Evaluation Output

```markdown
## Feature Evaluation Report

### Environment
- **URL:** [app URL]
- **Timestamp:** [when evaluated]
- **Features evaluated:** [N]

### Results by Feature

#### [Feature Name]
**Status:** Pass / Partial / Fail

| Criterion | Expected | Actual | Result |
|-----------|----------|--------|--------|
| [acceptance criterion] | [expected behavior] | [observed behavior] | pass/fail |

**Design Compliance:**
- Visual hierarchy: [pass/issues]
- State completeness: [pass/missing states]
- Interaction patterns: [pass/issues]
- Accessibility: [pass/issues]

**Issues Found:**
- [Issue description — severity, steps to reproduce]

**Evidence:**
- [Screenshot/GIF path if captured]

### Summary

| Feature | Criteria Passed | Criteria Failed | Design Compliance |
|---------|----------------|-----------------|-------------------|
| [name] | N/M | N/M | pass/partial/fail |

### Overall Assessment
- **Features passing:** N/M
- **Critical issues:** [list]
- **Design gaps:** [list]
- **Recommended fixes:** [prioritized list]
```

---

## Coordination with Other Skills

### From product-manager

- **Input:** Acceptance criteria from `features/*.md` become the source of truth for test cases
- **Output:** Untested criteria are flagged in Quality Audit reports; quality-manager can request spec clarification when criteria are ambiguous or untestable

### From frontend-designer

- **Input:** UX state completeness requirements, interaction specs, and accessibility criteria become component test cases and browser evaluation checklists
- **Output:** Feature Evaluation reports surface design compliance issues; missing states or broken interactions are flagged

### To code-review:code-review

- **Delegation:** Quality Audit mode invokes `code-review:code-review` for static analysis rather than reimplementing code review logic
- **Integration:** Code review findings are summarized in the audit report alongside coverage and acceptance criteria data

### To Codex-in-chrome

- **Usage:** Feature Evaluation mode uses Codex-in-chrome MCP tools for browser automation
- **Pattern:** Read specs first, then systematically verify each criterion in the browser, then report findings

---

## Guidelines

- **Spec-driven testing** — Always check `features/*.md` for acceptance criteria before writing tests. Tests should trace back to product requirements, not just code paths.
- **Tiered coverage** — Not all code deserves the same coverage target. Validators and data integrity code need 90%+; UI components need 60%+; generated code needs 0%.
- **`__tests__/` subdirectories** — Keep test files in `__tests__/` directories adjacent to source files. This keeps source directories clean while maintaining test proximity.
- **Don't test the framework** — Don't test that React renders, that Next.js routes work, or that shadcn/ui components display. Test your business logic and custom behavior.
- **Mock at boundaries** — Mock the database, external APIs, and file system. Don't mock internal functions unless they have side effects.
- **Delegate, don't duplicate** — Use `code-review:code-review` for code review rather than reimplementing. Use `/taste` for design system checks rather than writing visual assertions.
- **Browser evaluation is verification, not testing** — Feature Evaluation mode verifies shipped features work end-to-end. It complements but does not replace unit and integration tests.
- **Clean dev environment before evaluation** — Kill stale `next-server` child processes before starting `npm run dev`. Child processes survive `pkill -f "next dev"` — also run `pkill -f "next-server"`. Check DB locks with `lsof ~/.ainative/ainative.db`. Multiple zombie dev servers cause timeouts and hung pages.
- **Report, don't block** — Quality reports surface issues and recommend actions. They don't prevent shipping — that's the team's decision based on the data.
