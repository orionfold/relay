# G-085 DigitalOcean Relay Host conformance

Status: accepted 2026-07-20. Live run `20260720a` used the released Relay
`0.44.5` artifacts, the operator-approved DigitalOcean account and a bounded
same-session SFO3 environment. All provider resources and credentials were
removed after proof.

## Outcome

Prove that a clean, customer-owned DigitalOcean server can install the publicly
released npm Relay Host, run the publicly released and signed Relay Cell image
by immutable digest, and preserve the local Host contract for lifecycle,
isolation, ingress, recovery and customer-owned export. The proof ends with a
zero-orphan provider inventory, token revocation and actual-cost reconciliation.

The result is a bounded DigitalOcean beta recommendation, revision, or rejection.
It is not a general cloud-portability claim and does not introduce Fleet control.

## Approved execution profile

- Region: SFO3.
- Host: one Ubuntu 24.04 x64 Basic Regular Droplet, 2 vCPU, 4 GiB RAM,
  80 GiB local disk, priced at $0.03571/hour with a $24 monthly cap.
- Durable-data drill: one 10 GiB detachable block volume, deleted after its
  recovery evidence is exported.
- Network: one free cloud firewall and one free assigned reserved IPv4; Relay
  Cells, SQLite, Docker and the optional private model runtime are never exposed
  directly.
- Ingress: Caddy-managed TLS on a disposable hostname, with authenticated Relay
  ingress behind ports 80/443 and SSH restricted as tightly as the operator's
  current network permits.
- Runtime proof: one deliberately small Ollama model on the same private Host.
  This verifies private-runtime routing only and makes no production-capacity
  claim. BYOK hosted inference remains a separately configurable path.
- Cost window: same-session creation and teardown, expected 2-6 hours and less
  than $0.50 of infrastructure usage. Stop before creating or resizing anything
  that could put the approved $10 ceiling at risk.

## Operator-visible browser walkthrough

The run is automation-first and browser-visible. Repeatability comes from the
provider script and manifest; the browser is the operator's evidence and control
surface, not a substitute for automation.

For every stage, Codex must:

1. Explain the resource, purpose, incremental price and rescue action before the
   mutation.
2. Open the authenticated DigitalOcean control-panel page in Codex Chrome and
   show the pre-mutation state.
3. Execute exactly one bounded automation stage.
4. Refresh the control panel and show the resulting resource, status, labels and
   relevant cost or security settings.
5. Record a redacted receipt before continuing.

Walkthrough stages:

1. Account guardrails: show the $10 billing alert, account limits and empty
   G-085-labelled resource inventory.
2. Access: show the narrowly scoped API token record without revealing its
   value, then register the disposable SSH public key.
3. Network: create the firewall and reserved IP; show allowed ingress and the
   absence of public Cell/runtime/database ports.
4. Storage: create and show the 10 GiB G-085 recovery volume.
5. Compute: create the Droplet, attach the prior resources, show provisioning
   state and hourly/monthly price.
6. Bootstrap: show the Droplet overview while automation installs the released
   npm Host, Docker, Caddy and the exact signed Cell digest; then show health.
7. Product journey: use Relay in the browser to prove first admin, one Cell,
   two-Cell isolation, capacity refusal, private runtime and authenticated task.
8. Recovery: show the backup/export artifact, destroy the original runtime/data
   placement, restore into an empty root, and prove restarted work.
9. Cleanup: show each G-085 resource before deletion, run scoped teardown, then
   show zero matching Droplets, volumes, firewalls, reserved IPs and SSH keys.
10. Credential and cost closeout: revoke the token, remove its local environment
    entry, delete the local private key, and record the provider's posted or
    pending actual charge with a later reconciliation instruction if billing has
    not posted yet.

If Codex Chrome control is unavailable or loses the authenticated binding, stop
at the current safe stage. Do not replace the walkthrough with an invisible or
manually launched browser flow.

## Acceptance criteria

1. The npm package version, GitHub release assets and Cell digest all come from
   the same released Relay version; no local checkout artifact satisfies proof.
2. Provisioning and teardown are idempotent, label-scoped and resume from a
   redacted state file without duplicating resources.
3. Provider credentials remain in memory or the ignored mode-600 environment
   file, never logs, receipts, source, cloud-init or browser output.
4. The Droplet runs Relay Host and digest-pinned signed Cells as a non-root
   service; application data is outside the image and survives Cell replacement.
5. Only SSH and authenticated HTTPS ingress are public. Cell ports, SQLite,
   Docker and Ollama are loopback/private and negative probes fail.
6. One Cell and two same-Host Cells have distinct networks, mounts, ports,
   identity/data roots and resource limits. Collision and over-capacity attempts
   refuse without disturbing existing Cells.
7. A real authenticated browser journey and a real task reach the selected
   runtime; no runtime-registry module-load cycle occurs.
8. Export, encrypted backup, original-Host loss, empty-root restore, restart,
   upgrade/rollback and retained-data behavior have named receipts.
9. Teardown verifies zero G-085-labelled resources through both API inventory and
   the DigitalOcean browser. The API token and disposable SSH key are revoked.
10. Actual cost is reconciled against the estimate and approved ceiling; the
    beta recommendation states exactly what was and was not proven.

## NOT in scope

- A production-sized local LLM, GPU Droplet or performance/SLA claim.
- A managed database, load balancer, Kubernetes cluster, Spaces bucket,
  container registry mirror or multi-region topology.
- A second provider, Fleet Controller or remote authority over several Hosts.
- Productizing DigitalOcean account authorization in Relay Settings.
- Long-lived staging infrastructure or a 72-hour soak.
- Publishing, pricing, Website copy or enabling the beta by default without a
  separate release decision.

## Stop and rescue conditions

- If the public Relay release is missing, inconsistent or unsigned, create no
  DigitalOcean resource.
- If the plan exceeds the approved resource set or $10 ceiling, stop before the
  mutation and request a new gate.
- If two materially different repair attempts fail at the same stage, preserve
  redacted evidence, stop compute where safe, inventory all resources and report.
- A partially created resource is never hidden: the receipt names it and the
  next action is resume or scoped teardown.
- Recovery failure prevents beta acceptance. Preserve the source/export where
  doing so does not violate the same-session cost gate, then prefer local export
  over leaving billable infrastructure running.
- Cleanup failure is a release blocker. Revoke credentials only after the final
  cleanup attempt or after recording the exact resources the operator must remove.

## Accepted live execution — 2026-07-20

Run `20260720a` accepted the bounded DigitalOcean beta conformance profile.
The proof installed public npm `orionfold-relay@0.44.5` and pulled the current
signed Cell index by immutable digest
`sha256:caaa02dbb8c719b1274a5bff9084e69ffe40b17aef35323ac9666eada8dd1bd6`.
It used one Ubuntu 24.04 SFO3 Droplet (2 vCPU, 4 GiB RAM, 80 GiB disk), one
10 GiB recovery volume, a reserved IPv4, one scoped firewall and Caddy TLS on a
disposable hostname. Only SSH from the operator's current `/32` and public
HTTPS ingress were allowed.

The following acceptance evidence passed:

- Relay ran as a non-root system service behind authenticated HTTPS. The
  operator completed first-admin and inspected the signed Host entitlement and
  Cell inventory in a real Chrome session.
- Ten managed Cells were admitted; the eleventh was refused without disturbing
  existing Cells. Retained data continued to consume capacity, purge released
  it, and two Cells had distinct mounts, networks, ports and data.
- Cell restart preserved data. No Host license secret appeared in a Cell's
  container configuration.
- A pinned private Ollama runtime using `qwen2.5:1.5b` passed discovery and a
  real completed Relay task. This proves private-runtime connectivity on the
  bounded profile, not production model capacity.
- An encrypted backup was written to separate storage, the source Cell was
  export-released, and an empty-root replacement recovered and restarted with
  its marker intact. The prior `0.44.3` Cell digest also passed rollback health.
- Remote cleanup reported zero G-085 runtime containers. Provider teardown then
  removed the Droplet, volume, reserved IP, firewall and disposable SSH key;
  both API inventory and the DigitalOcean control panel showed no remaining
  G-085 resources. The API token, local environment entry and disposable
  private key were deleted.

The live run exposed and closed three release-blocking implementation defects:

1. Host provenance verification used GitHub CLI's authenticated API path.
   Relay now verifies both the signature and SLSA provenance anonymously with
   Cosign, constrained to the exact GitHub OIDC issuer and protected release
   workflow identity.
2. The one-shot Cell ownership normalizer could not traverse a mode-0700 Host
   data root. Its networkless, read-only helper now receives only `CHOWN` and
   `DAC_READ_SEARCH` in addition to dropped defaults.
3. A non-root Host could remove a Cell container but not purge its UID-10001
   data. Purge now uses a separate networkless, read-only helper with only
   `DAC_OVERRIDE` and `DAC_READ_SEARCH`, before the Host removes the empty root.

The Droplet existed for less than one hour at `$0.03571/hour`; the 10 GiB volume
adds less than one cent for that window. The conservative total is below
`$0.05`, far under the `$10` ceiling. DigitalOcean still displayed `$0.00`
because usage posts daily, so the named terminal cost state is
`G085_COST_PENDING`; there are no live billable G-085 resources while the final
posted amount catches up.

### Beta decision

Accept the **single customer-owned DigitalOcean Host topology** as technically
viable for a bounded beta after these fixes are included in a Relay release.
Do not claim provider portability, production local-model performance,
multi-Host Fleet control, or built-in one-click DigitalOcean provisioning.
Relay's existing Cloud Server screen remains a deterministic preview: customer
provider authorization and machine creation are still later product work.
