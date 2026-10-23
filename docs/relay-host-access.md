# Relay Host ingress and administrator access

Relay is still simplest on one laptop:

```bash
npx orionfold-relay
```

That starts `trusted-local` mode on `127.0.0.1`. It has no login because other
devices cannot reach the listener. Relay refuses to combine this profile with a
non-loopback hostname.

## Private LAN, VPN, or tailnet access

Choose the address your browser will actually use:

```bash
relay auth bootstrap
relay --hostname 0.0.0.0 \
  --exposure-profile private-authenticated \
  --public-origin http://192.168.1.20:3000
```

The bootstrap command prints one 15-minute credential. Open the public origin,
enter that credential at **Create the first administrator**, choose a password
of at least 12 characters, and save the eight recovery codes. Relay stores only
digests of bootstrap, password-derived, session, and recovery credentials.

Each password sign-in approves one named browser session for 12 hours. Review
or revoke sessions under **Settings → Access & sessions**. Recovery consumes one
code, changes the password, rotates every recovery code, and revokes all old
sessions.

## Internet access through TLS ingress

Use an HTTPS reverse proxy/tunnel that forwards only to this Relay process. Set
a high-entropy shared ingress credential on both sides; do not place it in a URL
or browser setting:

```bash
export RELAY_INGRESS_TOKEN='<random server-side secret>'
relay --hostname 127.0.0.1 \
  --exposure-profile remote-authenticated \
  --public-origin https://relay.example.com
```

The ingress supplies the same secret as `x-relay-ingress-token` together with
its canonical forwarded protocol and Host. Relay accepts forwarding metadata
only when that secret matches. TLS certificates and ingress configuration are
operator-owned; Relay does not claim to terminate TLS.
Remote-authenticated v1 also refuses a non-loopback listener so clients cannot
route around that ingress.

## Server callers with an API token

When Relay is called only by another server, such as an application backend
on a different host, set a shared API token on both sides:

```bash
export RELAY_API_TOKEN="$(openssl rand -hex 32)"
```

Once it is set, every request must carry `Authorization: Bearer <token>`, in
every exposure profile. Relay answers `401` with `API_TOKEN_REQUIRED` when the
header is absent and `API_TOKEN_INVALID` when it does not match. Relay reads
the token only from that header, never from a cookie or a query string, so a
browser cannot send it. With the token set, the Relay UI is reachable only
through a proxy that adds the header.

The token must be at least 32 characters. A shorter one makes every request
fail with `INGRESS_CONFIG_INVALID`.

Three things stay open without the token: `/api/health` and the routes under
it, so that probes keep working, and the Slack webhook, which carries its own
signature. Relay's own server-to-self calls send the token automatically.

A request with a valid token is treated as a server call. It needs no browser
session and no `Origin`. The checks that do not depend on a browser still
apply: spoofed authority headers are rejected, the route prefix must match,
and `remote-authenticated` still requires its TLS ingress. Relay removes the
`Authorization` header before the request reaches a route.

The token travels in clear text unless the connection is encrypted. Between
hosts, send it over TLS or over a private network.

## What the controls protect

- Every page and API route is protected by default. Only static assets, health,
  auth exchange routes, and the independently signed Slack webhook are public.
- Unsafe browser methods require the exact configured `Origin`.
- Caller-supplied Cell, customer, session, or forwarded-identity headers are
  rejected; they never select a customer or route.
- Auth attempts are rate-limited, sessions are opaque and revocable, and
  receipts contain named reason codes rather than secrets or customer content.
- Relay's internal HTTP calls use a per-process token accepted only on loopback.

One Cell still serves one customer organization. The Host supervisor controls
only Cells resident on its machine; it is not a Fleet Controller. For the
validated customer-owned server topology, follow
[Run a Relay Host on DigitalOcean](./digitalocean-relay-host.md).

To return to laptop-only operation, restart on loopback with
`--exposure-profile trusted-local`. Existing access data remains intact but is
not consulted in local mode.

Administrator recovery codes reset browser access. They are not disaster-
recovery keys and cannot rebuild a lost Cell. Configure the separate customer-
owned encrypted recovery flow in [Relay Cell encrypted recovery](./relay-cell-recovery.md)
to protect the Cell database, access state, files, settings, license data, and
local secret root from Host loss.
