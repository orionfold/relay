---
title: "License terms, in plain language"
category: "trust"
lastUpdated: "2026-07-17"
---

# License terms, in plain language

This page explains what buying a Relay Pack or Relay Host license gets you, in
the words we intend them. It is the canonical copy of the promises the
storefront makes; the code that enforces (and deliberately declines to enforce)
these terms is linked inline so you can check every claim.

**The engine is not licensed — it is free.** Everything that makes Relay run
(orchestration, governance, schedulers, runtimes, the license machinery itself)
is Apache-2.0 open source. The direct unmanaged single-Cell path and public
Relay Cell image are free too. Paid rights are separate:

- `product:orionfold-relay` unlocks premium Pack installation and updates.
- `product:relay-host` authorizes the managed Host supervisor and signed
  Host/Cell capacity. The launch contract is one Host and ten managed Cells.

A bundle may carry both entitlements in one signed envelope. Neither right
implies the other, and possessing public OCI image bytes grants neither.

## What a license is

A license is a small signed file — a `{ payload, signature }` JSON envelope —
issued to you at purchase and attached to your fulfilment email. Relay verifies
it entirely offline with an Ed25519 signature check against public keys embedded
in the open-source verifier
([`src/lib/licensing/verify.ts`](../../src/lib/licensing/verify.ts)). There is
no activation server and no periodic re-validation. Keep the file: it is the
durable proof of purchase even after an email download link expires.

## The term: what expiry does and does not do

Your license names an expiry date (`relay license status` shows it). The effect
depends on the paid right.

For Packs, expiry gates **new premium installs and Pack updates only**:

- Installed Packs never re-lock. Not at expiry, not if you remove the license,
  not ever. Your Packs are yours forever.
- Renewal buys forward motion: the year's new and updated Packs plus priority
  support.
- Removing a license (`relay license remove`) forgets the file; everything
  already installed keeps working.

There is no mechanism in the codebase that can disable installed Pack content.
The check happens at [Pack install/update time](../../src/lib/licensing/gate.ts)
and nowhere else. This is shipped behavior, not just policy.

For managed Hosts, the accepted contract is similarly customer-protective:

- Running and stopped Cells keep working and continue to count toward capacity.
- Existing Cells remain startable, stoppable, exportable, recoverable,
  rollback-capable, and purgeable after lapse.
- Compatible critical security updates remain available.
- New/imported/adopted/cloned Cells, restore-to-new, and routine feature
  upgrades require an active eligible Host grant.
- An over-limit request refuses before allocating a path, port, volume,
  network, Host record, or customer state.

The Host-local supervisor consumes the executable policy in
[`host-entitlement.ts`](../../src/lib/licensing/host-entitlement.ts). Until
the next npm release and the separate OCI/commerce/UX gates complete, this is a
pre-release local control-plane implementation rather than a purchasable,
end-to-end managed Host claim.

## Seats, Hosts, and managed Cells

A **seat** is one person in your organization who uses premium Packs. Your Pack
license records how many seats you bought (`relay license status` shows it).
We deliberately do not enforce Pack seats technically: there is no device
counting, user registry, or lockout. It is a locally auditable commercial term.

Host and Cell limits are different. They are signed as positive integers under
the Host grant and never overload `seats`. Running, stopped, and retained
managed Cells count. A direct unmanaged Cell, a standalone exported archive,
and a permanently purged Cell do not. V1 has no ambiguous “unlimited” sentinel;
a capacity upgrade is simply a newly signed higher integer limit.

## Transfer, replacement, and customer operation

The license file is portable. Redeem it on a new machine with
`relay license add <file>`; verification remains offline and works air-gapped.

- Pack use remains subject to its seat count.
- A one-Host entitlement can move to a replacement machine owned by the same
  licensee after the prior Host is retired. Offline v1 makes this an auditable
  commercial/local claim rather than an Orionfold activation check.
- Transferring either license to another organization requires reissue through
  the private support channel on the [Relay website](https://orionfold.com/relay/).
- A Host operator may manage Cells for its customers. That does not grant the
  right to resell the license or copy the operator's Pack entitlement into an
  unrelated customer's Cell.

## The boundary will not move under you

**What is free stays free.** Capabilities never migrate from free Core into paid
Packs or Host rights. Paid Packs are new maintained content; Host is managed
lifecycle authority, not repossessed Core.

Things we have ruled out: license state in the database, online re-validation,
a license file acting as a registry password, expiry that disables installed
Packs, and lapse that stops or strands existing Cells. Commercial license, OCI
release signature, and registry access remain separate authorities; see
[Relay Host fulfillment](../relay-host-fulfillment.md).

---

*If a storefront page and this page ever disagree, the stricter reading in your
favor applies while we fix it.*
