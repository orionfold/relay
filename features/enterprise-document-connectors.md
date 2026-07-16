---
title: Enterprise unstructured and document connectors
status: planned
priority: P1
milestone: post-mvp
goal: G-074
dependencies:
  - file-attachment-data-layer
  - document-preprocessing
  - document-manager
  - agent-document-context
  - document-output-generation
  - enterprise-structured-data-connectors
  - chat-tools-plugin-kind-1
  - scheduled-prompt-loops
source: Operator request, 2026-07-15
---

# Enterprise unstructured and document connectors

## Goal

Let an enterprise securely connect an external document source, select an
authorized scope, and bring unstructured content into Relay Documents through
an observable initial and incremental sync. Let operators publish Relay output
documents back to supported destinations and update existing remote content
only when the source format and concurrency controls make that truthful and
safe.

This is G-074. It adds a document-specific connector layer above the shared
connection, authorization, checkpoint, scheduling, receipt, and MCP foundation
planned by G-073. It must not create a second generic connector platform or
force binary files, hierarchical documents, and ACLs into a row-sync model.

## Why this goal exists

Relay already stores local Documents, extracts text from common formats, makes
documents available to agents, scans generated outputs, and provides a central
Documents UI. Enterprise knowledge also lives in Notion pages, SharePoint and
OneDrive libraries, Quip threads, Confluence, Google Drive, Box, Dropbox, object
stores, and application-specific knowledge repositories.

Repeated downloads lose remote identity, version truth, source permissions,
folder context, freshness, and provenance. A naive mirror also creates serious
risks: copying a file can outlive the source permission, retention policy, or
legal hold; source-native documents may not round-trip through Markdown or
Office export; and untrusted content can attack parsers or agents. One
capability-driven architecture is required before individual adapters ship.

## Relationship to G-073

G-073 and G-074 share versioned manifests, authorization, secret references,
destination trust, schedules, leases, checkpoints, retries, receipts, audit,
MCP transports/trust, and connection health UX. G-074 owns binary streaming,
source-native structure, versions, containers, permission/policy metadata,
extraction lineage, content safety, and publication. A joint TDR must settle the
shared kernel; neither goal may implement divergent shared infrastructure.

## Relationship to the Relay Host program

- Research, provider/format comparison, and the joint G-073/G-074 kernel design
  may proceed before the Relay Host implementation.
- Production document-connector implementation requires both the accepted G-073
  shared kernel and G-079's Host/cell trust contract.
- Remote object identities, ACL/policy fingerprints, local blobs, extracted
  content, parser state, checkpoints, receipts, quarantine, secret references,
  and outbound-network policy remain inside one Relay cell. The Host registry
  receives no document metadata or content.
- A local-only document connector tranche may ship without waiting for
  DigitalOcean. A remote/cloud Host support claim additionally conforms to
  G-081 callback/webhook/identity/routing protections and G-082 secret, backup,
  restore, export, retention, and permission-loss recovery contracts.
- G-083 may start, stop, upgrade, back up, and resource-limit a connector-bearing
  cell only through the typed cell lifecycle. It must not become an
  authorization proxy or cross-cell content plane.
- G-025 supplies the customer-identical release gate. Large provider SDKs,
  parsers, or transfer dependencies activate G-036 only when the measured
  package/install budget is crossed.

## Authoritative research baseline

Refresh this research against current primary documentation and record exact
API/spec versions before implementation begins.

- MCP 2025-11-25 resources support paginated discovery, reads, templates,
  optional subscriptions/list-change notifications, text, and base64 binary
  content. Hosts must validate URIs and permissions. Tools provide explicit
  model-invoked actions with JSON Schema and structured output; human approval
  remains appropriate for consequential writes.
- SharePoint and OneDrive content is represented by Microsoft Graph
  `driveItem`s. Delta queries expose current state plus a durable continuation
  URL, including deleted items and permission-change annotations. Download URLs
  are short-lived and should not be cached as authorization artifacts.
- Notion pages are trees of typed blocks, not flat files. Some block types are
  unsupported; nested content requires recursive paginated reads. Notion-hosted
  file URLs expire, while file upload has its own pending/uploaded/expired/failed
  lifecycle. Webhooks notify changes but the canonical content must be fetched.
- Quip documents are threads containing section-addressed HTML/Markdown and
  inherited folder/member permissions. Its OAuth scopes distinguish read,
  write, and manage; edits have format and request-size constraints; VPC
  customers use tenant-specific hosts; and some admin/event APIs require extra
  licensing.
- Google Drive separates native-document export from binary download and can
  restrict download/copy. Box event feeds may be duplicated or unordered and
  use stream positions. Dropbox recursive folder listing uses continuation
  cursors and exposes deleted/revision content according to retention.
- Amazon S3 notifications are at-least-once and can be duplicated; version IDs,
  delete markers, and per-key sequencers matter. Object storage therefore needs
  different reconciliation semantics from a collaborative document editor.

Primary sources captured during grooming (refresh at implementation):

- [MCP resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources), [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), and [security practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [Microsoft Graph driveItem](https://learn.microsoft.com/en-us/graph/api/resources/driveitem?view=graph-rest-1.0) and [driveItem delta](https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0)
- [Notion blocks](https://developers.notion.com/reference/block), [retrieving files](https://developers.notion.com/guides/data-apis/retrieving-files), [file uploads](https://developers.notion.com/reference/file-upload), and [webhooks](https://developers.notion.com/reference/webhooks)
- [Quip Automation API](https://quip.com/dev/automation/documentation/current)
- [Google Drive downloads/exports](https://developers.google.com/workspace/drive/api/guides/manage-downloads) and [content restrictions](https://developers.google.com/workspace/drive/api/guides/content-restrictions)
- [Box events](https://developer.box.com/reference/get-events) and [Dropbox file access](https://developers.dropbox.com/dbx-file-access-guide)
- [Confluence attachments](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-attachment/) and [versions](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-version/)
- [Amazon S3 event notifications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html) and [event structure](https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-content-structure.html)

Research deliverables:

1. A capability matrix for Notion, SharePoint/OneDrive, Quip, Confluence,
   Google Drive, Box, Dropbox, S3-compatible storage, and at least one
   application-specific knowledge repository.
2. A comparison of metadata-only/reference, cached-on-demand, full mirror, new
   publication, version publication, and source-native edit modes.
3. A permission/privacy/deployment matrix covering delegated versus application
   access, tenant/admin consent, private cloud/VPC/LAN endpoints, download and
   export restrictions, retention/legal hold, and permission-loss behavior.
4. A format-fidelity study for source-native blocks/sections, HTML/Markdown,
   Office/PDF, images/media, archives, comments, links, embeds, attachments, and
   unsupported objects.
5. A build-versus-adopt review of provider SDKs, transfer libraries, malware
   scanning hooks, parser isolation, and MCP components, including licensing,
   maintenance, runtime footprint, and clean-package behavior.
6. A recommendation for the first adapter tranche, shared-kernel TDR, threat
   model, and codebase-grounded phased implementation plan.

## Representative first tranche

The first delivery must remain bounded while proving different mechanisms:

1. one source-native collaborative document provider: Notion or Quip;
2. one hierarchical enterprise drive: SharePoint/OneDrive; and
3. one file/object repository: Google Drive, Box, Dropbox, S3-compatible
   storage, or an operator-approved conformance fixture until credentials exist.

Only disposable-provider sandbox adapters may be called shipped. Research may
change providers while preserving three distinct mechanism families.

## User journeys

### Connect, scope, and preview

1. From Documents or Settings > Connectors, the operator chooses a source.
2. Relay shows the effective tenant/account, requested scopes, source-native
   limitations, storage mode, network destination, and whether writes exist.
3. The operator authorizes and selects a site, drive, space, folder, bucket,
   query, or explicit document set within their current source permissions.
4. Relay previews hierarchy, document counts/types/sizes, estimated local
   storage, unsupported objects, and permission/policy warnings without copying
   content or writing upstream.
5. The operator selects metadata-only, cached-on-demand, mirror, or supported
   publication behavior and reviews a dry-run change summary.

### Pull and keep current

1. Relay discovers metadata and streams approved content through bounded
   validation into the existing Document storage and preprocessing pipeline.
2. Each Document retains stable source identity, version, parent/container,
   canonical source link, content hash, and extraction lineage.
3. Later runs consume delta/cursor/event/webhook mechanisms where available and
   reconcile periodically when notifications cannot prove completeness.
4. Deletes, permission loss, policy changes, and unsupported new versions pause
   or quarantine affected local content according to the approved policy.
5. Runs produce receipts with discovered, downloaded, unchanged, published,
   conflicted, quarantined, skipped, deleted, and failed counts.

### Publish Relay output

1. The operator chooses a Relay output Document and an authorized destination.
2. Relay previews filename/type conversion, hierarchy, metadata, overwrite or
   new-version behavior, permissions inherited at the destination, and fidelity
   losses.
3. A guarded operation creates a new remote document or publishes a new version.
4. Updating an existing source-native document requires a matching remote
   revision/precondition and an adapter that preserves the relevant structure.
5. The receipt links the local Document version to the exact remote object and
   revision without exposing a bearer/signed download URL.

## Document connector capability model

Every adapter declares:

- auth modes, scopes, tenant/account identity, admin-consent needs, token refresh,
  source/VPC host rules, and revocation;
- container/hierarchy discovery, pagination, traversal permissions, stable ids,
  path/move behavior, aliases/short links, and canonical source URLs;
- metadata, MIME/type, size, hashes, creation/modification time, owner/author,
  labels/tags, and supported policy metadata;
- binary download, native export formats, byte ranges/resume, signed URL expiry,
  maximum size, and checksum support;
- source-native structure, comments, embeds, links, attachments, unsupported
  content, and known fidelity losses;
- incremental mechanism, cursor retention, delivery/ordering/duplication,
  deletion/tombstone behavior, and full-reconciliation recovery;
- versions/revisions, ETags/preconditions, locks/checkouts, legal hold/retention,
  and restore semantics;
- create, upload, new-version, source-native edit, move, rename, trash, delete,
  and permission-change capabilities separately;
- rate, quota, concurrency, multipart/session, retry, and asynchronous export
  behavior; and
- MCP resources/templates/subscriptions/list changes, tools, structured outputs,
  and optional negotiated task support.

Relay must omit unsupported actions. Read plus write does not imply safe
bidirectional editing, and an export format does not imply round-trip fidelity.

## Durable data and storage model

Do not overload the current `documents` row with provider-specific state. Add
normalized connection and remote-document linkage records that can reference a
local Document and retain:

- connection/adapter/version and remote tenant/container/object ids;
- remote parent/path, canonical browser URL, type, version/ETag/hash, and
  created/modified metadata;
- storage mode, local blob/cache state, local Document version, source/publish
  lineage, normalized/extracted-content version, and parser version;
- last observed permission/policy fingerprint and named restriction flags;
- checkpoint/change/event identity, tombstone/quarantine/conflict state, and
  last successful verification time.

Store secrets only through the reviewed shared secret-reference abstraction.
Never persist temporary signed download/upload URLs as durable locators. The
blob write, Document row/linkage, extraction queue state, and checkpoint must
have an explicit crash-safe commit order. Content-addressed deduplication may
reduce storage, but it must not merge authorization, retention, or deletion
ownership across documents.

## Storage, permission, and deletion policy

- **Metadata-only/reference:** retain metadata and fetch content only after an
  authorized operator action. Do not imply offline availability.
- **Cached-on-demand:** keep a bounded local copy with an expiry/revalidation
  policy and visible last permission check.
- **Mirror:** maintain an explicit local controlled copy. Setup must warn that a
  copy can outlive source access and state the approved revocation policy.
- **Publish:** send an explicit Relay Document/version to a destination; never
  infer publication from local edits.

Source ACLs are evidence, not Relay authorization rules. Relay checks its own
authorization on every local read while preserving source provenance. When a
source denies access, removes permission, applies a restriction, or deletes an
item, the selected policy must quarantine, purge, retain under declared policy,
or request review visibly. Never silently retain and continue serving content
after permission loss, and never delete legal-hold/retained content based on a
generic source tombstone.

Remote destructive operations require a preview, threshold guard, explicit
confirmation, and remote precondition. The default is no remote delete.

## Content safety and processing

All inbound content is untrusted. Before the existing processor reads it:

- enforce connector, file, batch, and total-storage limits;
- sniff actual type rather than trusting extension or provider MIME alone;
- verify checksum/length where available and use atomic temporary writes;
- reject unsafe paths, links, symlinks, archives, recursive/decompression bombs,
  and unsupported encodings;
- provide a reviewed malware-scanning hook and visible unavailable/failed scan
  states instead of claiming a scan occurred;
- isolate high-risk parsers with time, memory, output, and child-process limits;
- treat extracted text, HTML, macros, comments, links, OCR, and document
  instructions as untrusted content at the agent boundary; and
- preserve original-versus-extracted lineage, parser version, truncation, OCR,
  unsupported sections, and fidelity warnings.

Remote HTML and custom URI schemes must not create executable UI or open-redirect
paths. Previews are sanitized and active content/macros never execute.

## MCP extension boundary

- Use resources/templates for container and document discovery, metadata, and
  bounded text/binary reads. Validate every custom URI and re-check permission
  when reading it; never translate a URI directly to an arbitrary local path or
  outbound URL.
- MCP resource `blob` is base64 content, not a mandate to load large files into
  model context or memory. Large/resumable transfer stays host-controlled behind
  a bounded adapter stream/session contract and returns safe metadata/resource
  links rather than bearer URLs.
- Use namespaced tools for test, rescan, download/cache, publish, new-version,
  move, trash, and delete operations. Consequential writes require host policy
  and operator confirmation; tool annotations are untrusted hints.
- Support optional resource subscriptions and list-change notifications, but
  keep durable provider checkpoints and periodic reconciliation authoritative.
- Use stdio for local and Streamable HTTP for remote servers with MCP resource
  indicators and no token passthrough. Experimental MCP tasks are negotiated
  only; Relay run state remains authoritative.
- A conformance connector must be addable without core engine changes and must
  prove malicious URI, oversized blob, schema drift, list/tool change, and
  permission-loss rejection.

## Product surfaces

- Shared Connector catalog and connection detail from G-073.
- Documents **Connect source** and source-scope wizard with hierarchy, storage
  estimate, restrictions, supported modes, preview, and dry run.
- Document source badge, canonical source action, freshness, remote/local
  version, storage mode, extraction lineage, permission state, and conflict.
- Publish/new-version action for eligible Relay outputs with conversion and
  destination-permission preview.
- Monitor/Operations receipts for discovery, transfer, processing, reconcile,
  publish, quarantine, and cleanup.
- Conflict/quarantine/error queues with exact remediation and no silent skip.

Use semantic tokens, system cursor behavior, keyboard navigation, visible focus,
responsive layouts, and accessible progress/error states in light and dark.

## Error and recovery contract

Define named errors for authentication/refresh, admin consent, permission loss,
download/export restriction, retention/legal hold, tenant/destination mismatch,
untrusted endpoint/redirect/URI, signed URL expiry, quota/rate limit, source
cursor expiry, event gap/duplicate/order, stale revision/precondition, lock,
unsupported native content, conversion/fidelity, checksum/size, malware/scan,
archive/parser limit, storage exhaustion, partial/multipart transfer, checkpoint,
lease/concurrency, schema/protocol, and remote asynchronous job failure.

Retryable failures preserve exact checkpoint and partial-transfer truth. Terminal
or policy failures pause/quarantine only affected scope and show remediation.
Zero documents is successful only when the provider proves a valid empty scope;
it must not mask permission or traversal failure.

## Required implementation plan

After research, TDR, threat model, and operator decisions, write a plan with
exact code/migration surfaces, rollback, packaging, regression budget, and:

1. shared connector-kernel boundary with G-073 plus document manifest,
   normalized envelopes, named errors, and conformance fixture;
2. durable connection/linkage/checkpoint/run model and secret/storage policy;
3. metadata discovery and preview for the first approved provider;
4. bounded snapshot pull into the existing Document and processing pipeline;
5. incremental changes, permission/policy drift, deletion, restart, and full
   reconciliation;
6. guarded publish/new-version for a provider with safe preconditions;
7. MCP stdio/Streamable HTTP extension conformance and remaining tranche;
8. scheduled operations, upgrade/rollback, docs, and fresh-install smoke.

Stop before production code if secret ownership, OAuth callback hosting, local
content retention after ACL loss, malware scanning, or a provider SDK changes
Relay's deployment/privacy model. Return alternatives and evidence.

## Verification and regression disposition

G-074 cannot close until automation covers:

- manifest/capability/version compatibility and malicious declarations;
- recursive hierarchy/pagination, inaccessible descendants, aliases/moves,
  empty scopes, duplicates, deleted objects, and stable source identity;
- binary/native export, signed URL refresh, ranges/resume/multipart, hashes,
  size limits, partial transfer, atomic storage, restart, and dedup isolation;
- delta/cursor/events/webhooks with duplicates, ordering, gaps, expiry, replay,
  permission/policy change, and full reconciliation;
- version/ETag/precondition conflict, source-native fidelity, unsupported blocks,
  conversion warnings, publish/new-version, and no silent overwrite/delete;
- least privilege, tenant ownership, source/Relay authorization separation,
  ACL-loss quarantine, retention/legal hold, secret/URL redaction, SSRF/redirect/
  URI controls, webhook validation, malware hook, parser limits, and prompt
  injection boundaries;
- MCP paginated resources/templates, text/binary reads, subscriptions/list
  changes, structured tools, large-transfer escape hatch, malicious URI/blob,
  stdio/Streamable HTTP, and optional-task fallback; and
- unchanged upload, local Document CRUD/preview/search, preprocessing, task and
  workflow document context, output versioning, Tables document import, Chat
  tools, snapshots, data clear, and package behavior.

Every claimed adapter needs a disposable real-source sandbox smoke; fixtures
prove only the architecture. Browser evidence covers setup, preview, sync,
freshness, permission loss, quarantine, conflict, publish, retry, pause, and
disconnect at desktop and 390px in light and dark. Runtime-registry-adjacent
imports require the repository's real `npm run dev` task smoke.

## Operator gates

1. Shared-kernel boundary and implementation order with G-073.
2. First provider tranche and which modes each adapter may claim.
3. Secret storage and OAuth callback topology, including hosted brokers/admin
   consent and private-cloud/VPC/LAN connectivity.
4. Metadata-only/cache/mirror defaults, storage budgets, and content-retention
   behavior after source permission loss, deletion, or policy change.
5. Malware-scanning/parser-isolation requirement and dependency/licensing cost.
6. Public connector/MCP SDK compatibility and large-transfer contract.
7. Publish, conflict, version, and remote deletion defaults.
8. Product licensing, telemetry/trust language, provider registrations,
   credentials/sandboxes, external writes, publish, and release.

## Out of scope for the first delivery

- An unbounded marketplace or universal ECM/content migration claim.
- Mirroring source ACLs as Relay's authorization system.
- Bypassing download, DLP, sensitivity, retention, legal-hold, or tenant rules.
- Executing macros, embedded scripts, active HTML, or unreviewed connector code.
- Full-fidelity editing for arbitrary binary or source-native documents.
- OCR/search/vector indexing redesign beyond invoking the existing documented
  preprocessing boundary and recording its lineage.
- Customer/private data or credentials in fixtures, docs, demos, or telemetry.

## Definition of done

The goal closes when the shared kernel, document layer, and representative
adapters work in a clean install; operators can safely connect, scope, preview,
sync, diagnose, publish, pause, and disconnect; a conforming MCP connector needs
no core-engine edit; and all security, real-source, browser, regression,
migration/rollback, packaging, and documentation evidence passes.
