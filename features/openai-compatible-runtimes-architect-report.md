# Architecture review — G-069

Date: 2026-07-14
Verdict: proceed with one new TDR

## Decision

G-069 extends TDR-006's adapter registry with two product identities and one
protocol transport. Sharing the transport avoids duplicated parsing and error
semantics; separate catalog/registry entries preserve configuration, security,
usage, and UI truth.

The adapters do not inject MCP/tool servers in this slice. Their catalog flags
therefore advertise no MCP/plugin-MCP or approvals. The files transitively
reachable from the runtime registry must not statically import Chat tools;
G-069 uses only function-local imports where Chat state would otherwise create
the TDR-032 cycle.

## Blast radius

High: runtime ID unions and fixed `Record<AgentRuntimeId, ...>` maps.
Medium: Chat model/provider unions, setup health, routing, profile manifests.
Low: SQLite schema because provider/runtime/model IDs are text and existing
receipt columns already carry the needed truth.

## Security and data flow

Operator prompt/history/context leaves the Relay server for the configured
endpoint. HTTPS is required for non-loopback endpoints unless the operator
explicitly accepts insecure remote HTTP. Credentials stay server-side. Relay
does not assert where LiteLLM routes traffic or whether LM Studio is local,
private, or free.

## Drift controls

- Every compatible runtime must have an explicit catalog entry and adapter.
- Shared protocol logic lives in `openai-compatible.ts`; identity policy stays
  in configuration/catalog data.
- `providerId` and `runtimeId` must not collapse to `openai`.
- Explicit compatible targets do not enter cloud fallback order.
- Cost remains unknown unless LiteLLM reports a valid cost.
- Real dev-server task smoke is mandatory for changes adjacent to the registry.
