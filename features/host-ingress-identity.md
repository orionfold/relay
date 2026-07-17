# G-081 — Internet-safe Host ingress and first-admin identity

## Goal Contract

**Outcome.** Relay has three explicit exposure profiles. `trusted-local` keeps
today's loopback-only, account-free behavior. `private-authenticated` protects a
tailnet, VPN, or LAN endpoint with Relay-owned identity. `remote-authenticated`
requires an HTTPS ingress plus a shared ingress credential. Every non-public
page and API route is protected by a revocable administrator session, while
server-owned Host/Cell routing metadata cannot be selected by callers.

**Constraints.** Non-loopback binding fails closed in `trusted-local`; one
organization occupies one Cell; secrets never enter URLs, browser storage,
application receipts, or routine server logs; only a configured ingress may
supply forwarding metadata; local/offline use remains account-free; external
SSO, Fleet identity, TLS termination, and a multi-Cell Host router are outside
this goal.

**Verification.** Pure policy tests, generated API-route classification,
bootstrap/session/recovery store tests, proxy integration tests, CLI source and
launch checks, browser journeys at desktop/mobile widths, build, runtime smoke,
and fresh security review.

**Operator gates.** The accepted G-078/G-079 model supplies the identity and
recovery decision: one built-in administrator per Cell, ordinary confidential
business data, and customer-owned Host administration. Any public trust copy,
external identity provider, SSO/compliance claim, push, publish, or release
remains gated.

**Stop/rescue.** If the Next.js Proxy cannot load the native auth store in a
real production build, retain the pure route policy and move the authoritative
session lookup to a loopback auth service before shipping. Never downgrade to
cookie-presence-only authorization.

## Scope challenge

- **REDUCE:** only reject unsafe binds and define route classes. Rejected: it
  would leave remote Cells unauthenticated.
- **PROCEED (selected):** built-in single-admin password, one-use bootstrap,
  rotating one-use recovery codes, opaque revocable sessions, exact-origin
  CSRF protection, rate limits, receipts, and Cell-side route binding.
- **EXPAND:** SSO/OIDC, WebAuthn, mTLS identity, Fleet authority, TLS
  termination, or the G-083 multi-Cell router. Deferred because each adds a new
  trust or deployment boundary and is not needed for a secure Host alpha.

## User and system behavior

### Exposure profiles

| Profile | Bind contract | Browser identity | Intended placement |
|---|---|---|---|
| `trusted-local` | loopback only | none | one person on one laptop/device |
| `private-authenticated` | explicit non-loopback allowed only with `--public-origin` | Relay session | LAN, VPN, tailnet |
| `remote-authenticated` | loopback listener, HTTPS public origin, and `RELAY_INGRESS_TOKEN` | Relay session | customer-owned TLS ingress |

The CLI refuses a non-loopback hostname under `trusted-local`. Authenticated
profiles require a canonical origin. Remote exposure requires HTTPS and v1
refuses a non-loopback listener so the configured ingress is the only external
route. The temporary server-to-self token is process-local, accepted only over loopback,
removed before application handlers, and never printed.

### First administrator and recovery

1. On the server, the operator runs `relay auth bootstrap`.
2. Relay writes only a SHA-256 digest to `<RELAY_DATA_DIR>/relay-auth.db` and
   prints the 15-minute credential once as explicit command output.
3. `/auth/setup` exchanges it atomically for a scrypt password digest, a fresh
   opaque session, and eight recovery codes. The credential cannot win twice,
   be replayed, or be used after expiry.
4. Recovery consumes one code, rotates the password and all remaining recovery
   codes, increments the credential version, and revokes every old session.

Recovery codes appear once in the response UI. Relay stores only their hashes.
The browser stores only an `HttpOnly`, `SameSite=Strict` cookie; HTTPS profiles
also set `Secure`. A login always issues a new opaque token, so a pre-existing
cookie cannot fix the session identifier.

### Sessions and device approval

Supplying the administrator password is the v1 approval ceremony for one named
browser/client session. Each session is independently listed under **Settings →
Access & sessions**, expires after 12 hours, and can be revoked without changing
the password. This is deliberate password-backed client approval, not device
attestation. WebAuthn or out-of-band device approval would be a separate goal.

### Authorization, CSRF, routing, and public routes

`src/proxy.ts` is an optimistic and authoritative request gate for this
single-admin application: every new application/API route is session-required
unless it is in the small public allowlist. The auth management handlers also
require the Proxy-injected session ID; caller-supplied session, Cell, customer,
or forwarded-identity headers are rejected.

Public routes are limited to static assets, health probes, auth exchanges, and
the Slack inbound route whose handler verifies its provider signature. Unsafe
browser methods must carry an exact configured `Origin`; the signed webhook is
the only origin-exempt mutation. Login, setup, and recovery share a persistent
hashed-client rate bucket (eight attempts per ten minutes).

The Cell accepts one server-owned `RELAY_CELL_ID`, canonical origin, and optional
route prefix. The current slice supplies the Cell-side route contract and
negative tests; G-083 owns the actual multi-Cell Host router and must bind an
external hostname/path to exactly one resident Cell. Path-based ingress must
strip the prefix before Next.js and pass the configured route assertion through
the authenticated ingress contract; it may not use caller customer/Cell IDs.

### Audit receipts

`relay-auth.db` is separate from customer content and forced to mode `0600`.
It stores named, content-free events such as `BOOTSTRAP_COMPLETED`,
`LOGIN_INVALID`, `SESSION_REVOKED`, and `RECOVERY_COMPLETED`, plus a hashed
client fingerprint. It never stores passwords, clear session/bootstrap/recovery
tokens, raw IP addresses, prompts, customer content, or raw user agents.

## Acceptance criteria

- Non-loopback `trusted-local` launch exits before starting Next.js.
- Authenticated launches without a valid origin fail closed; remote origins
  must be HTTPS and have an ingress credential.
- Unknown/new API and page routes require a live session by default.
- Wrong Host/origin/prefix and authority-header spoof cases are refused with a
  stable reason code.
- Bootstrap is single-use, time-bounded, atomic, and rate-limited.
- Login rotates the session ID; expired, revoked, old-credential-version, and
  recovered sessions fail.
- Recovery rotates codes and credentials and revokes all prior sessions.
- Unsafe browser mutations reject missing or foreign origins.
- The Settings surface lists and revokes named sessions and shows content-free
  access receipts.
- Trusted-local UI/API behavior remains unchanged.

## References

- TDR-044 and TDR-046
- `relay-threat-model.md` TM-001, TM-002, TM-010, TM-011
- [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication)
- [Next.js Proxy convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)

## Acceptance receipt — 2026-07-17

- Accepted all three exposure profiles, fail-closed CLI validation, the
  authenticated ingress-origin/path assertion, server-owned Cell/session
  headers, and protected-by-default classification for all 203 API route files.
- Accepted the separate mode-0600 auth store, atomic 15-minute bootstrap,
  scrypt administrator credential, twelve-hour opaque sessions, one-use
  recovery rotation, persistent rate limiting, and content-free receipts.
- Regression evidence: 29 focused policy/store/Proxy/CLI tests passed; the full
  suite passed 498 files and 3,714 tests with one intentional skip; token and
  route guards passed; and the production build completed with the Next.js
  Proxy and native SQLite store bundled.
- Real-runtime evidence: both `private-authenticated` and
  `remote-authenticated` profiles passed health, unauthenticated refusal,
  setup, bootstrap, live-session, CSRF, logout, and revocation checks in fresh
  temporary data directories.
- Browser evidence: setup, one-time recovery display, login, logout, session
  listing, access receipts, and the Settings access surface passed at desktop
  and 390 px widths with no overflow or browser-console errors.
- Fresh security review found and removed an overly broad static-file matcher;
  only Next.js immutable assets now bypass the Proxy, while file-looking upload
  API paths remain protected. No unresolved merge-blocking finding remains.

G-081 does not supply TLS termination or the multi-Cell Host router. G-083 must
consume this accepted Cell-side ingress contract rather than weakening it.
