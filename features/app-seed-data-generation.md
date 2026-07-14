---
title: App Seed Data Generation
status: deferred
priority: P1
milestone: post-mvp
source: internal history record
dependencies: [app-package-format]
---

# App Seed Data Generation

## Description

App creators build their apps using real data — actual portfolio positions,
real company names, genuine email addresses. Before publishing to the
marketplace, that data must be sanitized into realistic but synthetic seed
data that new users receive on install. This feature provides a structured
pipeline: snapshot live tables, apply per-column sanitization strategies,
run a PII detection pass, present a diff preview, and write sanitized CSVs
to the package's `seed-data/` directory.

Seven sanitization strategies cover the full spectrum from "keep as-is" to
"completely redact," giving creators fine-grained control over what gets
shared. A PII scanner acts as a safety net, flagging values that look like
real personal data even if the creator forgot to sanitize them.

## User Story

As an app creator, I want to generate sanitized sample data from my live
tables so that users who install my app get realistic seed data that
demonstrates the app's value — without exposing my personal financial data,
contacts, or other private information.

## Technical Approach

### 1. Sanitization strategies

Seven strategies, each implemented as a pure function in
`src/lib/apps/sanitizers/`:

| Strategy | Behavior | Parameters | Example |
|---|---|---|---|
| `keep` | Pass through unchanged | none | Status enums, categories |
| `randomize` | Generate random value within range | `min`, `max`, `step`, `type` (int/float) | Share counts, prices |
| `shift` | Offset dates by fixed delta, preserving order | `offsetDays` (auto-calculated from newest row) | Transaction dates |
| `faker` | Generate synthetic realistic values | `fakerMethod` (name, company, email, city, etc.) | Names, emails, companies |
| `derive` | Recalculate from other sanitized columns | `formula` (column references + arithmetic) | `shares * price` for total value |
| `redact` | Remove value entirely (set to null or placeholder) | `placeholder` (optional) | SSNs, API keys |
| `hash` | One-way hash preserving uniqueness | `prefix` (optional) | Account IDs, reference codes |

Each strategy module exports:

```ts
interface Sanitizer {
  name: string;
  sanitize(value: unknown, params: Record<string, unknown>, context: SanitizeContext): unknown;
}

interface SanitizeContext {
  columnName: string;
  rowIndex: number;
  otherColumns: Record<string, unknown>;  // for derive strategy
  allValues: unknown[];  // all values in this column, for distribution-aware randomize
}
```

### 2. Sanitization rules in manifest.yaml

Creators declare per-table, per-column sanitization rules in the manifest's
`seedData` section:

```yaml
seedData:
  tables:
    positions:
      sanitize:
        symbol:
          strategy: keep
        companyName:
          strategy: faker
          params:
            fakerMethod: company.name
        shares:
          strategy: randomize
          params:
            min: 10
            max: 1000
            step: 10
            type: int
        purchaseDate:
          strategy: shift
        purchasePrice:
          strategy: randomize
          params:
            min: 10.00
            max: 500.00
            type: float
        totalValue:
          strategy: derive
          params:
            formula: "shares * purchasePrice"
        accountNumber:
          strategy: hash
          params:
            prefix: "ACCT-"
        notes:
          strategy: redact
```

Columns not listed in the sanitization rules default to `redact` for safety.
The Zod schema in `validation.ts` validates the sanitization config structure.

### 3. PII scanner

`src/lib/apps/pii-scanner.ts` runs as a second pass after sanitization,
flagging values that still look like real PII. Detection rules:

| Pattern | Detection method |
|---|---|
| Real email domains | Check against top 50 email providers (gmail, yahoo, outlook, etc.) |
| Phone numbers | Regex: `\+?[1-9]\d{6,14}` or common formats like `(555) 123-4567` |
| SSN patterns | Regex: `\d{3}-\d{2}-\d{4}` |
| Credit card patterns | Luhn check on 13-19 digit sequences |
| Real-service URLs | Detect non-placeholder domains (anything not `example.com`, `test.com`) |
| Street addresses | Regex for common patterns: `\d+ [A-Z][a-z]+ (St|Ave|Blvd|Dr|Ln|Rd)` |
| IP addresses | IPv4 regex outside private ranges |

The scanner returns a structured report:

```ts
interface PiiScanResult {
  clean: boolean;
  findings: PiiFinding[];
}

interface PiiFinding {
  table: string;
  column: string;
  rowIndex: number;
  value: string;
  pattern: string;
  severity: "error" | "warning";
  suggestion: string;
}
```

Errors (high-confidence PII like SSNs) block seed data generation. Warnings
(ambiguous patterns like short numeric sequences) are displayed but don't
block.

### 4. CLI command — `ainative app seed`

The `ainative app seed` command orchestrates the full pipeline:

```
ainative app seed [--app-dir <path>] [--table <name>] [--force]

Steps:
1. Read manifest.yaml from app directory
2. Snapshot live tables (read-only DB query)
   - Only tables declared in the app's `provides.tables`
   - Respect row limit (default 50 rows, configurable via --max-rows)
3. Apply sanitization rules per column
   - Process columns in dependency order (derive columns last)
   - Log each transformation for auditability
4. Run PII scanner on sanitized output
   - Display findings with severity and suggestions
   - Block on errors unless --force is passed
5. Display diff preview
   - Side-by-side: original vs sanitized for first 5 rows
   - Summary: row count, columns changed, PII findings
6. Prompt for confirmation (unless --force)
7. Write sanitized data to seed-data/*.csv
```

### 5. Seed data loading on install

During `bootstrapApp()` in `service.ts`, after creating tables, check for
`seed-data/{table-name}.csv` files in the package. If present, parse the CSV
and insert rows into the newly created tables. This gives new users immediate
sample data to explore.

```ts
async function loadSeedData(appId: string, tableId: string, csvPath: string) {
  const rows = parseCsv(await readFile(csvPath, "utf-8"));
  const table = getTableDefinition(`${appId}--${tableId}`);
  for (const row of rows) {
    await insertTableRow(table.id, row);
  }
}
```

## Acceptance Criteria

- [ ] All 7 sanitization strategies are implemented as individual modules
      in `src/lib/apps/sanitizers/`.
- [ ] Each sanitizer has unit tests covering edge cases (null values, empty
      strings, out-of-range params).
- [ ] `seedData` section in manifest.yaml is validated by Zod schema.
- [ ] Columns not listed in sanitization rules default to `redact`.
- [ ] PII scanner detects email, phone, SSN, credit card, URL, address, and
      IP patterns.
- [ ] PII scanner blocks generation on high-confidence findings unless
      `--force` is passed.
- [ ] `ainative app seed` produces CSV files in `seed-data/` matching the
      declared table schemas.
- [ ] Diff preview shows original vs sanitized values for review.
- [ ] `bootstrapApp()` loads seed-data CSVs when present in the package.
- [ ] Round-trip test: seed from live data, install on fresh instance,
      verify row counts and column types match.

## Scope Boundaries

**Included:**
- 7 sanitization strategy modules (keep, randomize, shift, faker, derive,
  redact, hash)
- PII scanner with 7 detection patterns
- `ainative app seed` CLI command with preview and confirmation
- Seed data loading during app bootstrap
- Manifest `seedData` section schema validation
- CSV output format for seed data files

**Excluded:**
- LLM-based synthetic data generation (see `promote-conversation-to-app`
  for that approach)
- Automatic sanitization rule inference (creator must declare rules)
- Seed data for tables not declared in the app manifest
- Incremental seed data updates (full snapshot only)
- Seed data versioning across app updates

## References

- Source: `internal history record` section 7
- Related: `app-package-format` (defines where seed-data lives in `.sap`),
  `app-cli-tools` (provides the CLI framework for `seed` command)
- Files to create:
  - `src/lib/apps/seed-generator.ts` — orchestrator for the seed pipeline
  - `src/lib/apps/pii-scanner.ts` — PII detection engine
  - `src/lib/apps/sanitizers/index.ts` — strategy registry
  - `src/lib/apps/sanitizers/keep.ts`
  - `src/lib/apps/sanitizers/randomize.ts`
  - `src/lib/apps/sanitizers/shift.ts`
  - `src/lib/apps/sanitizers/faker.ts`
  - `src/lib/apps/sanitizers/derive.ts`
  - `src/lib/apps/sanitizers/redact.ts`
  - `src/lib/apps/sanitizers/hash.ts`
  - `src/lib/apps/__tests__/seed-generator.test.ts`
  - `src/lib/apps/__tests__/pii-scanner.test.ts`
- Files to modify:
  - `src/lib/apps/validation.ts` — add seedData Zod schema
  - `src/lib/apps/service.ts` — add seed data loading in bootstrapApp()
