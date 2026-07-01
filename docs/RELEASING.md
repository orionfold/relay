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
  (fixed 2026-07-01 — was stale `manavsehgal/ainative`).
