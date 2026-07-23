---
title: Codex Auth Session Isolation
status: completed
priority: P1
milestone: post-mvp
source: codex-chatgpt-authentication
dependencies: [codex-chatgpt-authentication]
---

# Codex Auth Session Isolation

## Description

Codex caches authentication state under `CODEX_HOME`, defaulting to `~/.codex`. Reusing that global home inside ainative would make login, logout, and session repair affect the operator's normal Codex CLI session, which is an unnecessary trust and debugging hazard.

This feature gives ainative its own isolated Codex auth home under the ainative data directory and forces file-based credential storage there. ainative's browser login, cached session reuse, and logout semantics all operate on that isolated session only.

## User Story

As a ainative user, I want ainative's Codex sign-in state isolated from my normal Codex CLI state so that using or troubleshooting ainative never logs me out of my usual Codex environment.

## Technical Approach

- Add ainative path helpers for a dedicated Codex home, config file, and auth cache path.
- Ensure the isolated Codex home exists before app-server startup and write a `config.toml` that forces `cli_auth_credentials_store = "file"`.
- Start every ainative-managed Codex App Server process with that isolated `CODEX_HOME`.
- Strip ambient `OPENAI_API_KEY` from app-server environment when ChatGPT auth is selected so OAuth mode cannot silently fall back to the host's API-key environment.
- Ensure logout clears only the isolated auth cache and persisted ainative session metadata.
- Detect a usable normal Codex session only as an adoption opportunity. After
  explicit customer consent, validate and copy it once into the isolated store
  with owner-only permissions, verify the copy, and roll it back on failure.

## Acceptance Criteria

- [x] ainative-managed Codex login uses a ainative-owned `CODEX_HOME` instead of `~/.codex`
- [x] ainative config forces file-based auth storage for predictable session handling
- [x] ainative logout clears only the isolated Codex auth cache
- [x] Ambient `OPENAI_API_KEY` does not leak into ChatGPT-authenticated Codex startup
- [x] Connection tests, chat, and tasks all reuse the isolated cached session consistently
- [x] A normal Codex session is never treated as connected until the customer
      explicitly adopts and Relay verifies an isolated copy

## Scope Boundaries

**Included:**
- ainative-owned Codex auth home
- File-based credential storage enforcement
- Logout/session cleanup for the isolated store
- Explicit, validated one-time adoption into the isolated store

**Excluded:**
- Sharing a live auth cache between ainative and the normal Codex CLI
- Silent or automatic credential import
- CI/CD credential-copy workflows

## References

- Related features: [codex-chatgpt-authentication](codex-chatgpt-authentication.md), [openai-codex-app-server](openai-codex-app-server.md)
