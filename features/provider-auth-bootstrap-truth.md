---
title: Provider Auth Bootstrap Truth
status: completed
priority: P0
milestone: mvp
source: _IDEAS/triage.md TRIAGE-061, TRIAGE-062, TRIAGE-063
dependencies: [codex-auth-session-isolation, runtime-readiness-truth-plan]
---

# Provider Auth Bootstrap Truth

## Description

Relay must give provider setup, connection tests, runtime readiness, and task
routing one consistent account of authentication. A successful test may never
coexist with a “Not configured” provider or silently use a credential mode the
customer did not select.

Fresh installs should prefer an actually available authentication method. Relay
may detect an existing machine Codex session as an adoption opportunity, but
must not call that session connected, read secrets into a response, share the
live global credential file, or let Relay logout mutate the global session.

## Corrective follow-up — 2026-07-23

The first implementation treated credential files as the primary discovery
surface. That is not portable or authoritative:

- On macOS, Claude Code stores subscription credentials in Keychain. Relay must
  execute the documented `claude auth status --json` command in the same
  process/user context and interpret its exit status and privacy-safe fields.
  A legacy credential file remains only a Linux/Windows compatibility fallback.
- Codex may store login state in `~/.codex/auth.json` or the operating-system
  credential store. Relay must discover a healthy Codex executable, skipping
  broken PATH shims, and use the supported Codex login/App Server interface.
- A browser cookie is never provider-authentication evidence.
- A probe failure is different from a confirmed signed-out result. Relay must
  preserve that distinction internally and never paint a false green state.
- Relay's isolated Codex home remains authoritative for connected state.
  Machine-level Codex auth is only an existing-session opportunity. A file can
  be explicitly copied; a keyring-only session cannot be exported or copied and
  must use Relay's isolated browser login.

## User story

As a customer with a Claude subscription, ChatGPT subscription, or explicit API
key, I want Relay to recognize the usable setup and explain any isolation step
so that the runtime I verified becomes honestly available for work.

## State contract

### Anthropic

- A stored method remains the explicit preference.
- With no stored preference, a successful current Claude CLI subscription-auth
  probe is preferred, then a usable compatibility credential or injected OAuth
  token,
  then an explicit API key; a blank install presents OAuth without claiming it
  is connected.
- API-key mode passes the selected database or environment key explicitly to
  the SDK. A missing or unreadable key fails with a named setup error and never
  falls through to cached OAuth.
- OAuth mode strips ambient API keys. Only a usable credential or a successful
  SDK probe marks Claude Code configured.
- Claude CLI status responses are reduced to login/auth-method/provider/plan
  classification. Email, organization identifiers, and token material are
  neither persisted nor returned to Settings.
- Anthropic Direct remains independently configured by an API key even when
  Claude Code uses OAuth.

### OpenAI

- Isolated Relay Codex auth remains authoritative for connected state.
- A successful global Codex login probe or structurally usable global
  `auth.json` is reported only as `existingSessionAvailable`; it is not
  connected state.
- With no stored preference, isolated or adoptable ChatGPT auth is preferred,
  then an explicit API key; a blank install presents ChatGPT sign-in.
- The customer may explicitly copy a usable global session into the isolated
  Relay Codex home. The source is never changed, the destination is created
  with owner-only permissions, an existing isolated file is never silently
  overwritten, and failed verification rolls the new copy back.
- A keyring-only global session is explained as detected but not directly
  importable. Relay offers isolated ChatGPT sign-in and never attempts to
  extract or migrate operating-system credentials.
- Codex launch resolves and verifies executable candidates. A broken PATH shim
  must not prevent Relay from using a healthy Codex or ChatGPT app binary.
- Normal browser sign-in remains available and Relay logout still touches only
  the isolated store.

### Routing and presentation

- Provider header, runtime cards, test result, readiness record, and eligible
  routing status derive from the same selected method plus verified credential
  state.
- Detection alone never adds an unadopted global session to the ready runtime
  pool.
- A successful explicit adoption or provider test refreshes the provider and
  routing views immediately.

## Acceptance criteria

- [x] API-key mode without an Anthropic key returns a named failure and cannot
      authenticate through cached Claude OAuth.
- [x] An environment Anthropic key is explicitly injected in API-key mode and
      is reported as environment-backed.
- [x] A successful Claude OAuth probe makes Claude Code configured on the next
      provider read; failed probes clear the verified marker.
- [x] Fresh auth defaults select a usable detected method without calling an
      unverified method connected.
- [x] A usable global Codex session produces an adoption opportunity but leaves
      Codex App Server unconfigured until explicit adoption.
- [x] Explicit global-session adoption creates and verifies only an isolated
      copy, refuses overwrite, rolls back failed verification, and never changes
      the global file.
- [x] Settings explains the isolation and offers both “Use existing Codex
      sign-in” and normal ChatGPT sign-in where applicable.
- [x] Runtime setup and provider API tests cover OAuth-only, API-key-only,
      dual-mode, unavailable, and detected-but-unadopted states.
- [x] A real development runtime smoke reaches provider Settings and exercises a
      Claude connection path without a module-load cycle.
- [x] A fresh macOS process with Claude Max/Pro in Keychain is detected through
      `claude auth status --json` without a credential-file dependency.
- [x] A broken PATH Codex shim is skipped when a healthy official app binary is
      available, and isolated App Server account state remains authoritative.
- [x] A global keyring/file Codex login is presented as detected-but-not-
      connected; only a safe file is offered for one-time adoption.
- [x] Regression tests cover authenticated, signed-out, executable-missing,
      malformed-output, broken-first-candidate, and keyring-only states.
- [x] Customer-identical macOS staging is launched outside the Codex sandbox
      and visually proves the provider badges/defaults against the operator's
      real CLI logins.

## Scope boundaries

Included:

- Anthropic selected-method enforcement and connection reconciliation.
- Safe one-time Codex credential adoption.
- Fresh-install method defaults and truthful provider/routing presentation.

Excluded:

- Sharing a live credential store between Relay and global Codex.
- Importing Claude secrets into Relay; Claude continues to use its supported
  SDK/CLI credential mechanisms.
- Exporting, copying, or reading macOS Keychain entries directly.
- Automatically changing an explicit stored auth preference.
- Provider pricing, model discovery, or routing-policy redesign.

## Failure behavior

- Missing API key: `ClaudeApiKeyNotConfiguredError`.
- Unreadable encrypted key without an environment fallback:
  `ClaudeApiKeyDecryptError`.
- Missing, malformed, unsafe, or non-ChatGPT global Codex file: named 4xx
  adoption refusal.
- Existing isolated auth: conflict; no overwrite.
- Post-copy Codex verification failure: remove only the newly copied isolated
  file, clear isolated OAuth metadata, and return a named failure.

## References

- `features/codex-auth-session-isolation.md`
- `features/runtime-readiness-truth-plan.md`
- Anthropic CLI reference:
  `https://code.claude.com/docs/en/cli-usage#authentication-commands`
- Anthropic credential management:
  `https://code.claude.com/docs/en/iam#credential-management`
- OpenAI authentication cache/storage:
  `https://learn.chatgpt.com/docs/auth#login-caching`
- OpenAI App Server auth endpoints:
  `https://learn.chatgpt.com/docs/app-server#auth-endpoints`
- Git history: `187f2404`, `41481037`, `70dd9116`
- TDR-032 runtime-module smoke precedent
- Runtime-graph receipt: task
  `d4cf9abc-0e4c-4ceb-b142-eed329588c68` selected, started, and completed under
  the real workflow/chat/scheduler graph without a module-load cycle.
- Customer-identical rebuilt npm staging on 2026-07-23 showed fresh Anthropic
  OAuth as unverified with Claude-specific guidance, a global Codex session as
  an explicit adoption opportunity, and Codex App Server still unconfigured
  until consent. No real credential was copied during acceptance.
- Corrective evidence on 2026-07-23: the same Claude CLI returned signed out
  inside the Codex sandbox but authenticated via `claude.ai` with a Max
  subscription in the normal macOS user context. The first acceptance therefore
  did not prove host credential discovery and was reopened.
- Corrective acceptance on 2026-07-23: the packed customer install was launched
  in the normal macOS user context. Privacy-safe API and in-app browser evidence
  showed Claude `claude.ai`/Max connected from the CLI probe, Claude Code active
  and eligible, the broken npm Codex shim skipped for the official app binary,
  and global Codex detected but isolated Relay Codex still unconfigured.
  No credential was copied, exported, logged, or mutated.
