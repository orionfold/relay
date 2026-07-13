# Relay — HANDOFF

_Last checked: 2026-07-12. Release `0.37.0` is live; tag `v0.37.0` points at `2f1eedec`, workflow `29163749517` passed, and npm/artifact/checksum/SBOM were independently verified._

## Live continuity

- All incomplete product, reliability, delivery, content, and governance work is consolidated and prioritized in `_IDEAS/backlog.md`; G-009 is the next ready goal without a prior operator/design gate.
- Waiting/operator/trigger gates are recorded on their backlog goals. Do not duplicate them here; add a HANDOFF entry only when an active goal crosses a real recovery boundary.
- Completed goal and release history lives in git, feature docs/changelog, TDRs, linked memory, and the timestamped `_SPECS/` records.

## Constraints and verification anchors

- Work directly on `main`; create a branch/worktree only when authorized or an independent concurrent writer requires isolation. Never share a checkout or `RELAY_DATA_DIR` between writers/instances.
- Strategy repo and `_IDEAS`/`_SPECS` symlink targets are edit-only unless the operator explicitly authorizes their git or external actions.
- `~/orionfold/website/` is the `_ASSETS` publish target; `~/ainative-business.github.io/` is a read-only quality reference, never a target.
- Use `docs/codex-browser-runbook.md` for UI verification. In-app Browser is first choice; normal Chrome launch alone is not evidence.
- Runtime-registry-adjacent imports require a real task under `npm run dev`, not only mocked unit tests. See TDR-032.
- Releases use an annotated `vX.Y.Z` tag and OIDC GitHub Actions; every release attaches a CycloneDX SBOM. Live push/tag/publish/release remains an operator gate unless explicitly authorized.
- On MINOR releases only, bump `CURRENT_PLUGIN_API_VERSION`, the previous-minor literal, and three plugin example YAMLs. Before tagging, inspect `scripts/npx-prod-smoke.mjs` for touched API contracts.
- Known baseline and deferred defects are backlog goals G-022 through G-024, not standing exceptions. Do not relabel new failures as baseline without a clean comparison.
