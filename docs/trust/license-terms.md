---
title: "License terms, in plain language"
category: "trust"
lastUpdated: "2026-07-01"
---

# License terms, in plain language

This page explains what buying a premium pack license actually gets you, in
the words we intend them. It is the canonical copy of the promises the
storefront makes; the code that enforces (and deliberately declines to
enforce) these terms is linked inline so you can check every claim.

**The engine is not licensed — it's free.** Everything that makes Relay run
(orchestration, governance, schedulers, runtimes, the license machinery
itself) is Apache-2.0 open source. A license only unlocks **premium packs**:
maintained vertical content bundles installed on top of the free engine.

## What a license is

A license is a small signed file — a `{ payload, signature }` JSON envelope —
issued to you at purchase and attached to your fulfilment email. Relay
verifies it **entirely offline** with an Ed25519 signature check against
public keys embedded in the open-source verifier
([`src/lib/licensing/verify.ts`](../../src/lib/licensing/verify.ts)). There
is no activation server, no periodic re-validation — Relay never sends your
data to Orionfold. Keep the
file; it is the durable proof of purchase — the download link in the email
expires, the file never does.

## The term: what expiry does — and does not — do

Your license names an expiry date (`relay license status` shows it). Expiry
gates **new premium installs and pack updates only**:

- **Installed packs never re-lock.** Not at expiry, not if you remove the
  license, not ever. Your packs are yours forever.
- **Renewal buys forward motion**: the year's new and updated packs +
  priority support.
- Removing a license (`relay license remove`) forgets the file; everything
  already installed keeps working.

There is no mechanism in the codebase that can disable installed content —
the license check happens at [pack install time](../../src/lib/licensing/gate.ts),
and nowhere else. This is shipped behavior, not just policy.

## Seats: defined by trust, audited by you

A **seat** is one person in your organization who uses premium packs. Your
license records how many seats you bought (`relay license status` shows it).

We deliberately do **not** enforce seats technically — no device counting,
no user registry, no lockouts. The verifier checks the signature, the term,
and the product entitlement; the seat count is your side of the deal.
`relay license status` is the self-audit surface: it shows what you're
licensed for so your admin can check compliance locally, without asking us
and without Relay telling us.

## Transfer and machines

The license file is portable. Redeem it on a new machine any time
(`relay license add <file>`); moving between machines, reinstalling, or
running air-gapped are all fine within your seat count. Transferring a
license to a different organization requires reissue — email
[manav@orionfold.com](mailto:manav@orionfold.com).

## The boundary won't move under you

**What's free stays free.** Capabilities never migrate from the free engine
into paid packs; paid packs are new content, not repossessed features. The
things we've ruled out permanently: license state in the database, upsell
banners in the CLI, online re-validation, and expiry that disables installed
packs.

---

*This page states intent in plain language and links the enforcing code. If
a storefront page and this page ever disagree, tell us — the stricter
reading in your favor applies while we fix it.*
