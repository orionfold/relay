# Public repository boundary

Relay's Git repository, Git archives, and npm package are public artifacts. A
file belongs in them only when it is part of the product, public trust record,
or contributor contract. Session continuity and private coordination remain
local even when they are useful to maintainers.

## Classification

| Surface | Classification | Public treatment |
|---|---|---|
| `README.md`, `CHANGELOG.md`, `SECURITY.md`, `LICENSE` | Product and trust documentation | Tracked and included in normal source archives. |
| Root build/package configuration | Contributor contract | Tracked; scanned as part of the public tree. |
| `docs/trust/**` | Public trust documentation | Tracked. `docs/trust/continuity.md` is intentionally public. |
| `docs/RELEASING.md`, `docs/plugin-security.md`, `docs/codex-browser-runbook.md`, this policy | Contributor documentation | Tracked and link-checked. |
| `features/**`, `.agents/**`, application source, tests, scripts, workflows, and design-system files | Public product/contributor record | Tracked; private identifiers are prohibited except in exact negative-fixture allowlists. |
| `.archive/handoff/**`, `HANDOFF.md`, `CODEX-CC.md`, `OPERATOR-REQUIREMENTS.md` | Internal operational continuity/history | Preserved locally, ignored by Git, and protected with `export-ignore`. |
| `docs/superpowers/plans/**`, `docs/superpowers/specs/**`, `.claude/plans/**` | Internal session planning/history | Preserved locally and ignored by Git; tracked legacy plan/spec paths are additionally protected with `export-ignore`. Durable product decisions must be promoted to a feature spec, TDR, or changelog before relying on these files. |

The approved 2026-07-13 classification removed 125 internal records from the
tracked tree without deleting local copies: 74 archived handoffs, 48 session
plans/specifications, and three root continuity documents.

## Content policy

Public text must not contain:

- operator- or machine-specific filesystem paths;
- paths or provenance from private peer projects;
- retired domains used as actionable current endpoints;
- direct personal support details or retired personal repository identities;
- links to operational handoffs or session-local planning records.

Historical product names are not secrets. They may remain where migration code,
tests, or release history needs them, but they do not justify retaining stale
domains, personal repository URLs, or private provenance. Portable examples use
synthetic identities such as `customer@example.com`, `/Users/alice/project`, or
`/home/user/project`.

## Enforcement

`npm run check:public-boundary` scans the current tracked tree. The release
workflow also scans a real Git archive and the real npm tarball before publish:

```sh
npm run check:public-boundary
git archive --format=tar --output=/tmp/relay-public.tar HEAD
node scripts/check-public-boundary.mjs archive /tmp/relay-public.tar
npm pack --pack-destination /tmp/relay-pack
node scripts/check-public-boundary.mjs npm /tmp/relay-pack/orionfold-relay-*.tgz
```

The checker fails closed if Git cannot enumerate a tracked file, an artifact is
missing or malformed, or any unallowlisted finding is present. Exceptions are
exact path/rule pairs in `scripts/check-public-boundary.mjs`; broad directory or
substring exceptions are not allowed.

One immutable production-signed license fixture has an exact
`personal-contact` exception because changing any payload byte invalidates its
Ed25519 compatibility signature. Public documentation and runtime assertions do
not repeat that identity; tests derive the expected value from the fixture.

When a new finding is intentional, document why it is public and add the
narrowest exact exception plus a positive regression. Otherwise repair the
content or move the internal record out of Git.
