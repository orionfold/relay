---
id: TDR-046
title: Remote Relay Cells use built-in single-admin identity and deny-by-default ingress
status: accepted
date: 2026-07-17
category: security
goal: G-081
---

# TDR-046: Remote Relay Cells use built-in single-admin identity and deny-by-default ingress

## Context

Relay is a local-first administrative application with more than 200 API route
files and no application identity boundary. G-081 must add safe tailnet/VPN and
internet exposure without introducing a cloud account dependency, a shared
multi-tenant data plane, or a route-by-route migration that can omit future
handlers. TDR-044 already accepts one customer organization per Cell and a
customer-trusted Host administrator.

## Decision

Relay keeps `trusted-local` account-free and loopback-only. Authenticated
profiles use one built-in administrator per Cell, a separate mode-0600 SQLite
identity store, scrypt password digests, hashed opaque bootstrap/session/recovery
credentials, password-approved named browser sessions, and content-free audit
events. A Next.js Proxy protects new routes by default, validates sessions
against the store, enforces exact-origin mutations, and rejects caller authority
headers. The small public allowlist is generated and audited.

TLS remains an ingress responsibility. Remote Relay binds loopback, and its
ingress proves it is configured with a shared server-side credential before
forwarding route metadata. A
process-local token permits Relay's loopback server-to-self calls without
making those application routes public. G-083 owns the multi-Cell Host router;
G-081 defines the Cell-side hostname/path binding and spoof-negative contract.

## Consequences

- Direct local users see no login and no external identity dependency.
- A non-loopback bind can no longer silently expose an auth-light Relay.
- New API/page routes inherit protection without remembering a per-handler
  wrapper, while privileged auth-management handlers consume the Proxy-injected
  session identity.
- Password-backed browser approval is intentionally simpler than WebAuthn,
  enterprise SSO, or out-of-band device attestation. Those remain separately
  gated work.
- Auth state must join G-082 backup/restore coverage and must remain separate
  from content-free Host registry/support receipts.

## Alternatives considered

- **External IdP/SSO first.** Rejected for alpha: it adds an online vendor and
  compliance surface, breaks offline/local operation, and is not required for
  one administrator per Cell.
- **Signed stateless session only.** Rejected because immediate per-device
  revocation and credential-version invalidation would be weaker.
- **Route-handler wrappers.** Rejected because existing and future routes can
  omit the wrapper; protection must be the default.
- **Reverse-proxy auth only.** Rejected because Relay would still trust a broad
  forwarding boundary and have no native recovery/session/audit semantics.
- **Main customer-content database.** Rejected to reduce coupling and make
  identity permissions, restore coverage, and support-export exclusion explicit.

## References

- `features/host-ingress-identity.md`
- `features/host-ingress-identity-plan.md`
- TDR-044
- `relay-threat-model.md`
