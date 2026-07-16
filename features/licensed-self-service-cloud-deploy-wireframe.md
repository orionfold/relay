# G-078 cloud deploy journey wireframe

Status: planning reference; no UI is implemented by G-078.

## Information architecture

Settings gains a paid `Cloud deployment` destination. The entry also appears in
the licensed product surface, but both routes open one journey and one durable
draft. Read-only comparison is visible without an entitlement; provisioning
controls are gated.

Journey steps:

`Compare → Configure → Estimate → Authorize → Deploy → Verify → Handoff`

The step rail is descriptive, not permission to skip required states. Returning
to an earlier step invalidates only dependent results and explains what must be
rerun.

## Compare

```text
┌ Cloud deployment ───────────────────────────────────────────────────────────┐
│ Run licensed Relay in infrastructure you own.             License: Active │
│ Resources, data and provider billing remain in your account.              │
├ Recommended ─────────────────────────┬ Other deployment shapes ────────────┤
│ Simple cloud Relay                   │ Relay + private model runtime        │
│ 1 isolated instance                 │ Distributed services  Planned       │
│ BYOK model APIs                      │ Hybrid LAN/VPC runtime  Planned      │
│ Local volume + encrypted recovery    │ Kubernetes/operator     Enterprise   │
│ Expected infra: $…–$… / month        │                                     │
│ [Inspect assumptions] [Choose]       │ [Compare all tradeoffs]             │
├ Ownership and limits ───────────────────────────────────────────────────────┤
│ Customer owns: account, bill, data, backups, keys.                         │
│ Orionfold does not receive customer content or retain cloud credentials.   │
│ Provider bill is authoritative. Regulated-data claims are not included.    │
└─────────────────────────────────────────────────────────────────────────────┘
```

Every card lists availability, failure domain, recovery shape and scale limit.
Planned profiles cannot be selected. Provider branding never obscures which
party owns support and billing.

## Configure and estimate

```text
┌ 2 Configure ────────────────────────┬ Live estimate ────────────────────────┐
│ Provider        Railway candidate  │ Expected monthly                    │
│ Account/project [Choose…]          │ Provider plan floor       $…         │
│ Region          [us-west …]        │ Relay compute × 1          $…         │
│ Instances       [1]                │ Persistent volume          $…         │
│ Exposure        Authenticated web  │ Backup/egress              $…         │
│ Runtime         BYOK hosted API    │ Model API        paid separately      │
│ Relay size      [1 GB / light]     │ Expected total              $…–$…     │
│ Storage         [10 GB]            │ Updated 2026-07-15 · USD · pre-tax    │
│ Backup          [daily / 14 days]  │ [Show formulas and source links]      │
│ Concurrency     [light]            │ Provider bill is authoritative.      │
├────────────────────────────────────┴────────────────────────────────────────┤
│ Unsupported option: Private GPU runtime needs a supported GPU adapter.      │
│ [Save draft]                                         [Run preflight →]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

Changing provider, region, topology, size, runtime or retention marks the prior
estimate/preflight stale. The cost panel keeps expected and upper-bound cases
side by side at larger widths and stacked on mobile.

## Preflight and authorization

```text
┌ Preflight ──────────────────────────────────────────────────────────────────┐
│ ✓ Cloud-deploy entitlement valid through …                                 │
│ ✓ Immutable Relay release digest and schema compatibility                  │
│ ✓ Region and topology supported                                            │
│ ✓ Recovery destination configured                                          │
│ ! Provider authorization required                                          │
├ Permission request ─────────────────────────────────────────────────────────┤
│ Relay will request: create/read/delete this deployment's compute, volume,  │
│ network, hostname and secret resources. It will not request billing-admin.  │
│ Authorization is used locally for this deployment and then discarded.      │
│ [View exact provider scopes] [Cancel] [Authorize with provider →]           │
└─────────────────────────────────────────────────────────────────────────────┘
```

Provider redirect returns to a nonce/state-bound callback. Authorization codes
or tokens never appear in the visible URL, receipts or browser storage. A failed
or denied authorization preserves the draft and gives a safe retry.

## Deploy progress and rescue

```text
┌ Deploying plan 6f2… · estimated recurring cost $…–$… ─────────────────────┐
│ ✓ Network and firewall                                                     │
│ ✓ Persistent volume                                                        │
│ ✓ Secret references                                                        │
│ ● Relay service                                      verifying health      │
│ ○ Authenticated hostname                                                  │
│ ○ First recovery artifact                                                  │
├ Current state: provisioning ────────────────────────────────────────────────┤
│ It is safe to close this page. Progress is stored in the deployment receipt.│
│ [Open provider project ↗] [Cancel safely]                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

On partial failure, the success styling disappears and is replaced by:

```text
Partially provisioned — two resources may still incur charges.
Created: network, volume. Missing: Relay service, hostname.
Cause: provider rejected image pull (PROVIDER_IMAGE_DENIED).
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

┌ Ready — owned by Acme's Railway account ────────────────────────────────────┐
│ Relay URL, region, version/digest, data volume, backup destination          │
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

Delete confirmation shows the exact plan/resource inventory:

- resources to delete;
- backups/volumes retained or deleted;
- estimated continuing cost of retained resources;
- last verified recovery point and export action;
- typed deployment name confirmation and session reauthentication.

Success requires a final provider inventory. Partial deletion lists ongoing
billable resources and does not use a generic success toast.

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
