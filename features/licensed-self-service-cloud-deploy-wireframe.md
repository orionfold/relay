# G-078 cloud deploy journey wireframe

Status: planning reference; no UI is implemented by G-078.

## Information architecture

Settings gains a paid `Cloud deployment` destination. The entry also appears in
the licensed product surface, but both routes open one journey and one durable
draft. Read-only comparison is visible without an entitlement; provisioning
controls are gated.

Journey steps:

`Placement → Configure Host → Estimate → Authorize → Install → Verify → Handoff`

The step rail is descriptive, not permission to skip required states. Returning
to an earlier step invalidates only dependent results and explains what must be
rerun.

## Compare

```text
┌ Cloud deployment ───────────────────────────────────────────────────────────┐
│ Run licensed Relay in infrastructure you own.             License: Active │
│ Resources, data and provider billing remain in your account.              │
├ Recommended ─────────────────────────┬ Other deployment shapes ────────────┤
│ Local device or cloud server        │ Relay + private model runtime        │
│ 1 Relay Host · 1+ isolated cells    │ Sharded Relay Hosts                 │
│ BYOK model APIs by default           │ PaaS single-cell         Later       │
│ Host-local state + off-host recovery │ Distributed services     Enterprise  │
│ Expected infra: $…–$… / month        │                                     │
│ [Inspect assumptions] [Choose]       │ [Compare all tradeoffs]             │
├ Ownership and limits ───────────────────────────────────────────────────────┤
│ Customer owns: account, bill, data, backups, keys.                         │
│ Orionfold does not receive customer content or retain cloud credentials.   │
│ Provider bill is authoritative. Regulated-data claims are not included.    │
└─────────────────────────────────────────────────────────────────────────────┘
```

Every card lists availability, Host trust boundary, failure domain, recovery
shape and scale limit.
Planned profiles cannot be selected. Provider branding never obscures which
party owns support and billing.

## Configure and estimate

```text
┌ 2 Configure ────────────────────────┬ Live estimate ────────────────────────┐
│ Placement       Cloud server       │ Expected monthly                    │
│ Provider        DigitalOcean       │ VM plan                    $…         │
│ Account/project [Choose…]          │ Weekly provider backup     $…         │
│ Region          [us-west …]        │ Host count                 1          │
│ Cells           [1]                │ Admitted cells/Host        1*         │
│ Exposure        Tailnet / Web      │ Model API        paid separately      │
│ Runtime         BYOK hosted API    │ Expected total              $…–$…     │
│ Host size       [2 GiB / 1 vCPU]   │ Updated 2026-07-16 · USD · pre-tax    │
│ Backup          [weekly + export]  │ *Provisional until Relay is measured  │
│ Concurrency     [light]            │ [Show formulas and source links]      │
├────────────────────────────────────┴────────────────────────────────────────┤
│ Host operator can access every cell. Use separate VMs for hostile tenants.  │
│ Unsupported: local GPU runtime needs a supported GPU Host size.              │
│ [Save draft]                                         [Run preflight →]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

Changing placement, provider, region, Host size, cell count, exposure, runtime
or retention marks the prior estimate/preflight stale. The cost panel shows Host
count, cell admission/safety reserve and expected/upper cases side by side at
larger widths and stacked on mobile.

## Preflight and authorization

```text
┌ Preflight ──────────────────────────────────────────────────────────────────┐
│ ✓ Cloud-deploy entitlement valid through …                                 │
│ ✓ Immutable Relay release digest and schema compatibility                  │
│ ✓ Host OS/runtime and region supported                                     │
│ ✓ Cell ports, networks, mounts and ownership are collision-free            │
│ ✓ Host capacity admits requested cells with safety reserve                  │
│ ✓ Recovery destination configured                                          │
│ ! Provider authorization required                                          │
├ Permission request ─────────────────────────────────────────────────────────┤
│ Relay will request: create/read/delete one VM, firewall, hostname, backup   │
│ and bootstrap secret. It will not request billing-admin.                    │
│ Authorization is used locally for this deployment and then discarded.      │
│ [View exact provider scopes] [Cancel] [Authorize with provider →]           │
└─────────────────────────────────────────────────────────────────────────────┘
```

Provider redirect returns to a nonce/state-bound callback. Authorization codes
or tokens never appear in the visible URL, receipts or browser storage. A failed
or denied authorization preserves the draft and gives a safe retry.

## Deploy progress and rescue

```text
┌ Installing Host plan 6f2… · estimated recurring cost $…–$… ───────────────┐
│ ✓ VM, firewall and backup                                                   │
│ ✓ Signed Relay Host artifact                                                │
│ ✓ Host supervisor and authenticated ingress                                │
│ ● Cell acme                                           verifying isolation  │
│ ○ Runtime route and resource limits                                         │
│ ○ First recovery artifact                                                   │
├ Current state: provisioning ────────────────────────────────────────────────┤
│ It is safe to close this page. Progress is stored in the deployment receipt.│
│ [Open provider project ↗] [Cancel safely]                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

On partial failure, the success styling disappears and is replaced by:

```text
Partially provisioned — two resources may still incur charges.
Created: VM, firewall. Missing: Host supervisor, cell.
Cause: Host rejected image digest (HOST_ARTIFACT_UNVERIFIED).
[Resume from failed step] [Roll back created resources] [Open exact resources ↗]
```

Rollback has its own progress and can itself end `rollback-partial`; the UI then
lists every remaining resource and provider-console cleanup link.

## Verify, first login and handoff

```text
┌ Verification ───────────────────────────────────────────────────────────────┐
│ ✓ TLS hostname       ✓ Artifact digest       ✓ Relay health/version        │
│ ✓ Auth boundary      ✓ Runtime connectivity  ✓ Recovery artifact           │
│ ● Create first admin (single-use link expires in 09:42)                    │
│ [Open Relay and create admin →]                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌ Ready — Relay Host owned by Acme's DigitalOcean account ────────────────────┐
│ Host URL/region/version, trust boundary and cell inventory                  │
│ Cell acme: port/network/data root/resource budget/backup lineage            │
│ Estimated monthly range and source date                                     │
│ Authorization revoked/discarded: Yes                                        │
│ [Open Relay] [Download redacted receipt] [Run restore drill]                │
│ [Upgrade] [Export] [Transfer ownership] [Delete deployment]                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

Ready is impossible until remote authentication and Relay health/version checks
pass. If recovery creation is delayed, state is `verification-failed` or a
specific degraded state approved by product—not silently ready.

## License lapse

The page becomes read-mostly and clearly separates unavailable paid automation
from customer ownership:

```text
Cloud automation license expired. Your provider resources and data remain yours.
[Renew automation] [Export Relay data] [Recovery instructions]
[Open provider project ↗] [Manual cleanup instructions]
```

It never threatens deletion, disables provider-console access, or hides export.

## Delete

Delete confirmation distinguishes cell deletion from Host deletion and shows:

- the selected cells and/or Host/provider resources to delete;
- backups/volumes retained or deleted;
- estimated continuing cost of retained resources;
- last verified recovery point and export action;
- typed deployment name confirmation and session reauthentication.

Removing a cell retains its data by default. Purge is a separate irreversible
action with resolved-path containment. Host deletion requires a final provider
inventory. Partial deletion lists ongoing billable resources and does not use a
generic success toast.

## Responsive behavior

- Desktop: step rail plus two-column form/cost or progress/evidence layout.
- Tablet: step rail becomes compact horizontal progress; cost remains visible
  beside primary confirmation when space permits.
- Mobile: one column; sticky bottom action never covers cost, permission or
  destructive details; monitoring/rescue remains complete.
- Tables of line items become stacked definition lists without dropping source
  date, exclusions, or expected/upper-bound values.

## Interaction and accessibility

- System cursor only; no hand-cursor switching instructions or code.
- Native buttons/links, visible focus, logical heading and tab order.
- Status text and icon accompany color; progress announcements use a polite live
  region and failures use an assertive named summary.
- External provider links open a new tab and show an external-link indicator.
- Secrets are write-only with presence/source indicators and explicit rotation;
  copy buttons never expose stored credentials.
