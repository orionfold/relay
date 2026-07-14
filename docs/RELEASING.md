# Releasing `orionfold-relay` to npm

Publishing is automated via **npm Trusted Publishing (OIDC)** from GitHub Actions.
There are **no tokens, no 2FA prompts, and no OTP** — the whole reason this exists
is that the `orionfoldllc` npm account uses passkey/WebAuthn 2FA that the CLI cannot
satisfy (see the `npm-publish-2fa-friction` memory). OIDC removes the human-auth
step entirely.

## One-time setup (already done in code; the npm side needs a browser)

The GitHub Actions workflow is committed at `.github/workflows/publish.yml`. To
activate it, configure the **Trusted Publisher** on npm **once**:

1. Go to <https://www.npmjs.com/package/orionfold-relay/access> → **Trusted Publisher**
   (or Settings → Trusted Publisher on the package page).
2. Add a **GitHub Actions** trusted publisher with **exactly** these values:
   - **Organization or user:** `orionfold`
   - **Repository:** `relay`
   - **Workflow filename:** `publish.yml` (filename only, not the full path)
   - **Environment name:** *(leave blank)*
   - **Allowed actions:** check **`npm publish`**
3. Save. That's it — no token is created or stored anywhere.

After the first successful OIDC publish, optionally harden the account:
Settings → **Publishing access** → *"Require two-factor authentication and disallow
tokens"* — this makes OIDC the ONLY way to publish (kills the throwaway-token path
for good). Do this only after verifying a release works end-to-end.

## Every release (after setup)

From a clean, pushed `main`:

```bash
npm version patch          # or: minor / major — bumps package.json + tags vX.Y.Z
git push --follow-tags     # pushes the commit AND the tag
```

Pushing the `vX.Y.Z` tag triggers `.github/workflows/publish.yml`, which:
- checks the tag matches `package.json` version,
- builds the CLI (`build:cli`) and runs the licensing test gate,
- runs `npm publish` — authenticated via OIDC, with **provenance generated
  automatically** (the npm page shows a verified "built from this repo" badge).

Watch the run in the repo's **Actions** tab. No secrets to manage.

## Versioning axes — bump these together (the standard's forward-compat checklist)

The "Orionfold Packs" standard has **three independent versioning axes**. They must move
*together* at release time or the standard silently drifts (the exact near-miss the
`apiversion-window-bump-at-version-bump` memory documents). This is one ordered checklist a
release consults — the axes are **co-listed, not merged**: they are separate mechanisms for
separate artifact kinds.

1. **Index schema** — `orionfold.packs/v1` (the string in `index.json`, read by
   `src/lib/packs/index-schema.ts`). **Additive fields only within a version.** A *breaking*
   index change majors the string (`v1` → `v2`); a `v1` Relay then refuses a `v2` index loudly
   (the `.strict()` + literal `schema` discriminant — a v1 core rejects rather than misreads).
   Do not remove or repurpose a field within a version; only add optional ones.
2. **Per-pack `relayCore`** — the semver range in each pack's `pack.yaml`
   (`src/lib/packs/format.ts` field; checked at `install.ts` post-acquire AND, for a remotely
   fetched pack, skipped *early* in the R2 resolver before the fetch). A pack adopting a new
   manifest field **must raise its `relayCore`**, exactly as the `price`-object shape did — older
   cores reject an unknown key via `.strict()`. This is per-pack forward-compat; the compat-diff
   CI gate (`_IDEAS/packs-robustify.md` R5) guards each pack's own version-to-version compat.
3. **Plugin `apiVersion` window** — `CURRENT_PLUGIN_API_VERSION` (`sdk/types.ts`) + the
   previous-MINOR literal (`registry.ts`) + the 3 example `src/lib/plugins/examples/*/plugin.yaml`.
   **Bump on every MINOR** (the window test derives its expected window from `package.json` and
   fails loudly until every site bumps together). A PATCH does NOT bump it.

**Do NOT unify `relayCore` (packs) with `apiVersion` (plugins)** — they version different artifact
kinds. This checklist co-lists them so a release never bumps one axis and forgets another.

## Why not a stored `NPM_TOKEN` secret?

A long-lived token in GitHub secrets is exactly the leak-prone artifact OIDC
replaces. With trusted publishing, GitHub mints a short-lived, single-use identity
that npm verifies against the trusted-publisher config above — bound to this repo
and this workflow file. Nothing to rotate, nothing to revoke, nothing to paste.

## Requirements (already satisfied by the workflow)

- npm CLI **≥ 11.5.1** and Node **≥ 22.14.0** on the runner (the workflow pins
  Node 22 + upgrades npm).
- `permissions: id-token: write` in the job (present).
- `package.json` `repository.url` must point at `github.com/orionfold/relay`
  (fixed 2026-07-01 — previously pointed at a retired repository).
