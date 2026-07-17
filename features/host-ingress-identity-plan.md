# G-081 implementation plan

Authoritative specification: `features/host-ingress-identity.md`.

## Vertical slices

1. **Trust profile and route policy.** Add canonical environment accessors,
   fail-closed CLI flags, server-owned Cell/origin/prefix classification, header
   spoof rejection, and a generated protected-by-default route inventory.
2. **Identity store.** Add the mode-0600 separate SQLite store, scrypt password
   digest, hashed opaque credentials, atomic bootstrap, revocable sessions,
   recovery rotation, persistent rate buckets, and content-free events.
3. **Request boundary.** Add Next.js Proxy session enforcement, exact-origin
   mutation protection, authenticated ingress forwarding, process-local
   loopback self-call authorization, and security response headers.
4. **Operator/user surfaces.** Add bootstrap/login/recovery pages, one-time
   recovery-code display, and Settings session/revocation/audit controls.
5. **Conformance and documentation.** Update CLI/user/API/trust docs; run
   targeted tests, type/build, broader regression suite, authenticated runtime
   and browser smokes, and fresh security review.

## Regression-test budget

- Pure route policy: public allowlist, protected default, two-Cell prefix,
  wrong origin, and authority-header spoof cases.
- Store: bootstrap win/replay/expiry, password login, independent sessions,
  expiration/revocation, rate limit, recovery reuse/rotation, and receipts.
- Proxy: page/API unauthenticated matrix, exact Origin, live session,
  server-to-self loopback token, TLS ingress, wrong Host, and spoof rejection.
- CLI: source contract plus built CLI help/fail-closed launch probe.
- Browser: setup, recovery-code interstitial, login, settings session list and
  revocation at desktop and mobile widths.

## Broader verification

Run TypeScript, production build (validates Node Proxy plus
`better-sqlite3`), the generated 203-route inventory, relevant existing CLI,
health, trigger, API, and shell tests, then full unit suite if targeted checks
are stable. Start a separate-data-dir authenticated dev instance and exercise
health/unauth/authenticated requests plus browser pages. Trusted-local smoke
must still load without identity state.

## Rescue and rollback

- If native SQLite cannot load in Proxy, do not weaken the check; move the
  store behind an internal loopback service and keep the same policy/API.
- If a legacy server self-call is found, add the process-local internal header
  at that call site and a regression test; never make its API route public.
- To return a deployment to local-only use, restart with loopback hostname and
  `trusted-local`; this leaves auth data intact but unused. Do not delete it as
  part of exposure rollback.
