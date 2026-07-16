---
title: Enterprise structured-data connectors
status: planned
priority: P1
goal: G-073
dependencies:
  - tables-data-layer
  - tables-document-import
  - tables-export
  - tables-agent-integration
  - chat-tools-plugin-kind-1
  - scheduled-prompt-loops
source: Operator request, 2026-07-15
---

# Enterprise structured-data connectors

## Goal

Let an enterprise securely connect an external structured-data source, map its
objects and fields to Relay Tables, and run observable pull, push, or genuinely
supported bidirectional synchronization. Make new connector implementations
additive through a versioned connector contract aligned with Model Context
Protocol (MCP), without turning an external MCP server into Relay's source of
truth for synchronization semantics or security policy.

This is G-073. The first delivery is a connector platform plus a deliberately
small, representative adapter tranche, not a promise to ship every named
vendor in one release.

## Why this goal exists

Relay Tables already support file import, export, editing, enrichment, workflow
triggers, and agent access. Enterprises also keep operational records in
Notion, Airtable, relational databases, and systems such as Microsoft 365 and
Salesforce. Repeated exports lose freshness, source identity, revision history,
and ownership of conflicts. Point integrations would duplicate authorization,
mapping, retry, checkpoint, audit, and deletion logic.

The product therefore needs one host-owned synchronization substrate with
capability-specific adapters. MCP is the extension boundary for discoverable
schemas/resources and explicit connector operations; it does not replace the
durable sync engine, Table data model, or operator approval boundary.

## Relationship to the Relay Host program

- Research, provider comparison, capability modeling, and the connector-kernel
  specification may proceed before the Relay Host program is implemented.
- Production connector implementation requires G-079's accepted Host/cell trust
  contract. A connection, its secret references, worker/scheduler, checkpoints,
  mappings, receipts, cached payloads, and outbound-network policy belong to one
  Relay cell and never to the content-free Host registry.
- A local-only connector tranche may ship after G-079 without waiting for a
  cloud provider proof.
- Claiming connector support on a remote/cloud Host additionally requires
  conformance with G-081 for callback, webhook, ingress, identity, routing, and
  SSRF boundaries, and G-082 for per-cell secret roots, backup, restore, export,
  and permission-loss recovery.
- G-083 may supervise connector-bearing cells only through the versioned cell
  lifecycle and resource contract. It must not inspect, centralize, or proxy
  connector credentials or customer data.
- G-025 runs a customer-identical connector journey for every connector release
  candidate. G-036 remains a trigger-only packaging concern if connector SDKs
  cause the npm or OCI artifact to cross its measured budget.

## Authoritative research baseline

The implementation plan must refresh this research against current primary
documentation before code starts and record the exact API/spec versions used.

- MCP 2025-11-25 defines stdio and Streamable HTTP transports. Remote HTTP
  authorization follows its OAuth-based authorization profile, including
  protected-resource metadata, resource indicators, PKCE, audience validation,
  and a prohibition on token passthrough. Resources expose schemas and source
  data; tools expose actions with JSON Schema inputs and structured outputs.
- MCP tasks are experimental in the current specification. A connector may
  negotiate task support for long-running work, but v1 correctness cannot
  depend on experimental task semantics.
- Notion data-source queries are paginated and permission-scoped; Notion
  recommends webhooks rather than polling for current changes. Capabilities
  separate read, insert, and update permissions.
- Airtable imposes per-base and per-token request limits, paginates list reads,
  provides batch operations, and exposes webhooks. Rate-limit and batching
  behavior must be part of its adapter contract rather than hidden in UI code.
- PostgreSQL logical replication starts with a snapshot and then streams
  changes. Updates and deletes require usable replica identity, and independent
  writers can conflict. Publication filters are not by themselves a complete
  security boundary.
- MySQL row-based binary logging, SQL Server change tracking/CDC, Microsoft
  Graph delta queries plus change notifications, and Salesforce replayable
  change events each expose materially different cursor, retention, identity,
  and recovery semantics. The architecture must model these capabilities
  explicitly instead of presenting every provider as an identical webhook.

Research deliverables:

1. A source-family capability matrix for Notion, Airtable, PostgreSQL, MySQL,
   SQL Server, Microsoft Graph, Salesforce, and one spreadsheet-oriented source.
2. A security and deployment comparison for local credentials, OAuth public
   clients, OAuth confidential clients, database TLS, hosted callback brokers,
   webhooks, and private/LAN sources.
3. A build-versus-adopt review of relevant SDKs and MCP components, including
   maintenance health, licensing, package/runtime footprint, and server-side
   compatibility.
4. A recommendation for the first adapter tranche. It must prove three
   different mechanism families: collaborative structured SaaS, relational
   database, and enterprise application or a representative conformance fixture
   approved as a temporary substitute.
5. A Technical Decision Record, threat model, and codebase-grounded
   implementation plan before production mutations begin.

Primary research sources captured for grooming (refresh at implementation):

- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization),
  [transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
  [resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources),
  [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools),
  and [tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)
- [Notion data-source query](https://developers.notion.com/reference/query-a-data-source),
  [webhooks](https://developers.notion.com/reference/webhooks), and
  [integration capabilities](https://developers.notion.com/reference/capabilities)
- [Airtable Web API limits](https://support.airtable.com/docs/managing-api-call-limits-in-airtable)
  and [webhooks](https://support.airtable.com/docs/airtable-webhooks-api-overview)
- [PostgreSQL logical replication](https://www.postgresql.org/docs/current/logical-replication.html)
  and [publication security](https://www.postgresql.org/docs/16/logical-replication-security.html)
- [MySQL binary logging](https://dev.mysql.com/doc/refman/8.4/en/replication-options-binary-log.html)
  and [SQL Server change tracking/CDC](https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/track-data-changes-sql-server?view=sql-server-ver17)
- [Microsoft Graph delta query](https://learn.microsoft.com/en-gb/graph/delta-query-overview),
  [Salesforce event durability](https://developer.salesforce.com/docs/platform/pub-sub-api/guide/event-message-durability.html),
  and [Google Sheets value operations](https://developers.google.com/workspace/sheets/api/guides/values)

## User journeys

### Connect and preview

1. From a Relay Table or Settings > Connectors, the operator chooses a source.
2. Relay shows supported direction, objects, fields, authentication method,
   required scopes, network destination, and known limitations before asking
   for credentials or authorization.
3. The operator tests the connection and selects a source object or query.
4. Relay previews source schema and sample rows without persisting imported
   records or sending Relay records upstream.
5. The operator maps identity, fields, types, relations, attachments, and
   deletion behavior, then reviews a dry-run change summary.

### Initial and incremental synchronization

1. Relay imports or exports a bounded initial snapshot with pagination/batching.
2. It commits a checkpoint only after durable Table writes and sync metadata
   succeed together.
3. Later runs consume a supported cursor, webhook, delta API, or CDC stream.
4. Each run produces a receipt with direction, counts, checkpoint, duration,
   retries, skipped rows, conflicts, and named errors.
5. The operator can pause, resume, retry failed records, inspect conflicts, and
   perform a fresh rescan when the upstream cursor is no longer valid.

### Extend Relay with another connector

1. A connector declares a versioned manifest and capabilities.
2. It exposes schema/catalog information through MCP resources or resource
   templates and explicit read/write operations through namespaced MCP tools.
3. Relay validates its transport, authorization requirements, schemas,
   capabilities, and trust state before installation or activation.
4. A conformance suite proves the connector can be added without changing the
   core sync engine.

## Connector capability model

Every adapter must declare truthfully, rather than emulate silently:

- authentication modes, required scopes, tenant/account boundaries, and token
  refresh behavior;
- object/schema discovery and stable source/object identifiers;
- snapshot reads, pagination, ordering guarantees, and maximum batch sizes;
- incremental mechanism: cursor, webhook, delta query, CDC, or polling;
- cursor retention/replay window and full-rescan recovery;
- supported insert, update, upsert, and delete operations;
- stable record identity, revision/precondition support, and tombstones;
- source types, relations, attachments, formulas/computed values, and fidelity
  losses;
- rate limits, concurrency limits, retry hints, and backoff requirements;
- webhook verification, replay protection, delivery guarantees, and ordering;
- API/spec version and compatibility range; and
- optional MCP resources, tools, prompts, notifications, and negotiated task
  support.

Relay must refuse or omit unsupported direction and operations. It must never
present periodic polling as real-time synchronization or a write-only provider
as bidirectional.

## Architecture requirements

### Host-owned connector contract

Define a versioned `ConnectorAdapter` contract with normalized envelopes for:

- discovered objects and fields;
- source records and source revisions;
- inserts, updates, deletions, and schema changes;
- checkpoints/cursors and their validity window;
- field-level validation and coercion findings;
- rate-limit/retry instructions; and
- named connector errors that preserve safe provider diagnostics.

The Relay host owns scheduling, mapping, conflict policy, durability, auditing,
authorization decisions, and Table mutations. Adapter code owns provider
translation and protocol behavior. Provider-specific conditions must not leak
through generic strings that callers have to parse.

### Durable sync state

Persist connection metadata, adapter/version, source-object identity, Table
mapping, direction, schedule, last successful checkpoint, in-progress run,
per-record source identity/revision, conflicts, and receipts. Store secret
references only; plaintext access/refresh tokens, passwords, and private keys
must not live in Table rows, connector manifests, exports, MCP payloads, logs,
or receipts.

Snapshot and delta application must be idempotent and transactionally safe.
Crashes after provider reads or partial writes must resume without duplicate
rows or incorrectly advanced checkpoints. Concurrent/manual/scheduled runs for
one connection need an explicit lease or equivalent single-writer guard.

### Mapping and type fidelity

The mapping layer must distinguish source identity from display labels and
record conversion decisions. It must support null, empty, deleted, and invalid
values; preserve enough origin metadata for reconciliation; and surface lossy
coercions before activation. Schema additions, removals, renames, and type
changes pause or degrade only the affected mappings with visible remediation.

### Direction, conflicts, and deletes

- Support pull-only, push-only, and bidirectional as separate capabilities.
- Bidirectional sync requires stable identity plus usable revision or
  precondition semantics; it is not inferred because reads and writes both
  exist.
- Default conflict behavior is manual review. Source-wins and Relay-wins are
  explicit policies. Do not use silent last-write-wins.
- Prevent echo loops by recording origin and applied source revision/change id.
- Default destructive behavior is tombstone, soft-delete, or manual review.
  Bulk remote deletes require a preview, threshold guard, and operator
  confirmation.

### MCP extension boundary

- Use stdio for local connector processes and Streamable HTTP for remote MCP
  servers; do not build new integrations on deprecated HTTP+SSE transport.
- Treat remote MCP servers as untrusted until explicitly approved. Validate
  manifests, resource URIs, JSON Schemas, structured outputs, capability/list
  changes, and namespaced tool identifiers.
- Use MCP resources/resource templates for catalogs and schemas, and MCP tools
  for explicit test/read/write/checkpoint operations. Tool annotations are
  hints, not security policy.
- Bind authorization tokens to the intended MCP resource and never pass a
  client token through to an upstream provider.
- Keep experimental MCP tasks behind capability negotiation and an adapter
  fallback; durable Relay sync state remains authoritative.
- Ship a conformance fixture demonstrating that a connector can be added and
  exercised without editing the core engine.

## Security and privacy requirements

The mandatory threat model covers token theft and passthrough, over-broad OAuth
scopes, tenant confusion, webhook spoofing/replay, SSRF and DNS rebinding,
unsafe redirects, insecure LAN endpoints, SQL injection/over-privileged DB
users, malicious MCP metadata/output, cross-instance leakage, secrets in logs,
sync echo loops, deletion amplification, schema drift, replay-window gaps,
partial batches, and stale credentials.

Required controls include:

- least-privilege scopes and database roles, TLS by default, explicit consent
  for non-TLS or private-network endpoints, and visible destination identity;
- encrypted secret storage through a reviewed secret-store abstraction and
  redacted diagnostic paths;
- callback `state`, PKCE where applicable, exact redirect validation, token
  audience/resource validation, refresh rotation handling, and revocation;
- webhook signature verification, timestamp/replay checks, durable dedupe, and
  fast acknowledgement followed by queued processing;
- parameterized queries and allowlisted source/schema/table identifiers;
- destination/redirect validation that cannot be bypassed by DNS resolution or
  redirect chains; and
- per-connection authorization checks on every UI/API/job/MCP boundary.

Relay must never claim that a publication, row filter, source view, or provider
permission alone establishes customer isolation. The connection test and setup
receipt must state the effective account/tenant/database/object boundary.

## Product surfaces

- **Connector catalog:** supported sources, status, capability summary, and
  trusted extension entry point.
- **Connection wizard:** authorization, source selection, sample preview,
  mapping, direction, conflict/delete rules, schedule, and dry run.
- **Connection detail:** health, last/next run, checkpoint, adapter/API version,
  permissions, mapping drift, receipts, conflicts, and pause/disconnect.
- **Table integration:** connected-source badge, last freshness time, manual
  sync, mapping entry point, and row-level origin/conflict state without making
  dense Table views noisy.
- **Operations/Monitor:** scheduled and manual sync runs use existing operation
  and receipt conventions, with named retryable versus terminal failures.

All new surfaces must follow Relay semantic tokens, system cursor behavior,
keyboard navigation, visible focus, responsive layouts, and light/dark themes.

## Error and recovery contract

At minimum, define and handle named errors for authentication/refresh,
permission/scope, destination trust, connection/TLS, rate limiting, source
schema drift, source cursor expiry, webhook verification/replay, malformed
provider/MCP output, mapping/coercion, conflict, lease/concurrency, checkpoint
commit, partial batch, remote precondition, and unsupported capability.

Every error is visible in the connection and run receipt. Retryable failures
show the next retry and preserve checkpoint truth. Terminal failures pause the
affected connection or mapping and state the exact remediation. Empty source
results are successful only when the adapter can prove they are a valid page or
snapshot, never when an upstream error was swallowed.

## Phased implementation plan requirement

The plan must be written after the research, TDR, threat model, and operator
decisions. It must include codebase paths, data migration/rollback, a regression
budget, real-source sandbox evidence, and vertical slices in this order:

1. Versioned adapter/capability contract, normalized envelopes, conformance
   fixture, named errors, and threat-model controls.
2. Durable connection/mapping/checkpoint/run/receipt data model with secret
   references and restart/concurrency tests.
3. Snapshot pull through one approved adapter into a Table, including preview,
   mapping, pagination, receipts, and browser UX.
4. Incremental pull with provider-appropriate delta/webhook/CDC recovery.
5. Guarded push and conflicts/deletes for an adapter that can support them
   truthfully.
6. MCP stdio and Streamable HTTP extension conformance plus the remaining
   approved source-family adapters.
7. Scheduled operations, packaging/docs, upgrade/rollback, and customer-like
   fresh-install smoke.

If discovery shows that OAuth callback hosting, secret ownership, or a provider
SDK materially changes Relay's deployment/privacy model, stop before production
implementation and return an evidence packet with alternatives.

## Verification and regression disposition

Before G-073 can close, automated coverage must prove:

- manifest/capability/schema compatibility and rejection of unsupported or
  malicious connector declarations;
- snapshot pagination/batching, duplicate pages, empty pages, stable identity,
  type fidelity, and lossy-coercion warnings;
- incremental cursors, out-of-order/duplicate webhooks or changes, replay-window
  expiry, rescan, and checkpoint durability across restart;
- idempotent pull/push, echo suppression, preconditions, conflicts, deletes,
  schema drift, partial batch failure, retry/backoff, and rate limits;
- secret redaction, authorization ownership, callback and webhook validation,
  SSRF/redirect/DNS defenses, parameterized database access, and malicious MCP
  inputs/outputs;
- one-writer lease behavior and visible stale-run recovery;
- MCP stdio and Streamable HTTP conformance for resources, tools, structured
  output, capability negotiation, and optional task fallback; and
- unchanged local file import/export, normal Table edits, enrichment, workflow
  triggers, agent Table access, and unrelated runtime behavior.

Real sandbox accounts or disposable databases must verify the approved adapter
tranche; synthetic fixtures do not justify claiming a vendor integration is
shipped. Browser evidence must cover setup, preview, healthy sync, mapping
drift, conflict, retry, and disconnect on desktop and 390px, light and dark.
Any runtime-registry-adjacent import change also requires the repository's real
`npm run dev` task smoke, not only mocked unit tests.

## Operator gates

Implementation does not cross these gates without explicit approval:

1. First adapter tranche and what qualifies as the three source-family proofs.
2. Secret-store ownership and OAuth callback topology, especially any hosted
   broker or cloud dependency.
3. Public connector manifest/SDK/MCP contract and compatibility policy.
4. Default conflict and deletion behavior.
5. Product tier/licensing, telemetry, and user-visible trust language.
6. Provider app registrations, credentials, sandbox provisioning, and any real
   external write, publish, or release.

## Out of scope for the first delivery

- An unbounded connector marketplace or claims of universal database support.
- Unreviewed community code running in the Relay process.
- ETL warehouse transformation, arbitrary SQL authoring, or data-lake storage.
- Silent production writes, destructive initial reconciliation, or automatic
  conflict resolution based only on timestamps.
- Customer data or credentials in fixtures, demos, docs, telemetry, or MCP
  transcripts.
- Cross-source joins beyond existing Relay Table capabilities.

## Definition of done

G-073 is done only when the approved connector platform and representative
adapter tranche ship through a clean install; an operator can connect, preview,
map, synchronize, diagnose, pause, and disconnect without secret leakage or
silent data loss; a new conforming MCP connector can be added without changing
the core sync engine; the required real-source and browser evidence passes; and
the durable docs, migration/rollback, security review, and regression suite are
current.
