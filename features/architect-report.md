---
generated: 2026-07-21
mode: integration
---

# Architect Report

## Integration analysis — G-107 cross-cloud Relay Host portability

### Accepted change

Research and plan a provider-neutral Relay Host deployment playbook, followed
by independently verified AWS, Azure, GCP, and later lower-cost provider
increments. DigitalOcean remains the accepted reference implementation;
Marketplace-specific G-103 is deferred.

### Architectural finding

The DigitalOcean implementation already separates into a large portable core
and a small provider adapter surface.

```text
portable Relay contract
  → Ubuntu/OCI/npm bootstrap
  → Host/Cell lifecycle + entitlement
  → authenticated ingress + first admin
  → recovery/update/rollback + redacted receipts
  → provider capability mapping
       → VM/address/firewall/disk/bootstrap/inventory/cleanup
```

TDR-044's customer-owned single-Host appliance remains the right architecture.
Cross-cloud work changes placement and provisioning, not the Host, Cell, Fleet,
data, licensing, or distribution boundaries.

### Existing surfaces to reuse

| Concern | Existing authority/surface | Portability disposition |
|---|---|---|
| Host/Cell topology | TDR-044; Host supervisor | unchanged |
| Artifact authority | npm Host + signed digest-pinned Cell OCI | unchanged |
| Entitlement | `product:relay-host` offline signed grant | unchanged |
| Customer journey | G-084 Settings + G-105 DigitalOcean guide | generalize common steps |
| Conformance | G-085/G-105 scripts and receipt vocabulary | extract provider-neutral core |
| Recovery | G-082 encrypted export/restore | unchanged; map provider disks/snapshots separately |
| Provider effects | `scripts/lib/digitalocean-g085-*` | define a narrow provider capability interface |
| Cost model | `scripts/cloud-deploy-cost-model.mjs` | extend with dated provider inputs, not product logic |

### New or amended surfaces

- A versioned compatible-Linux-VM contract and customer-facing playbook.
- A secret-free, idempotent bootstrap asset plus completion evidence.
- A provider capability/mapping worksheet and support-claim taxonomy.
- A portable preflight/conformance receipt separated from paid provider
  provisioning.
- Bounded provider adapters/guides and real-provider proof goals after G-107
  selects their order.
- G-086 amended from a vague second-target trigger into the final portability/
  GA evidence gate over the approved increments.

### Security and lifecycle findings

- User-data must be treated as retrievable metadata, not a secret channel.
- VM creation success does not prove cloud-init/startup completion; Relay needs
  a named completion check and failure receipt.
- Static IPs, disks, snapshots, firewalls, keys, and temporary credentials all
  belong in cleanup inventory because resources can survive VM deletion.
- The customer retains provider credentials in provider tooling. Relay v1 does
  not become a credential-holding orchestration service.
- Backup claims must distinguish crash-consistent provider snapshots from the
  accepted application-level encrypted recovery path.

### Provider ordering decision

The weighted, dated matrix selects provider-neutral G-108 first, then AWS
Lightsail G-109, Azure VM G-110, GCP G-111 and AWS EC2 G-112. Lightsail is the
simple bundled AWS journey; its evidence does not cover EC2. Azure precedes EC2
to establish provider-company diversity. Hetzner/Akamai remain a trigger-gated
G-113 economics/geography tranche.

### Blast radius

| Layer | Expected impact | Risk |
|---|---|---|
| Product/claims | new portable versus verified-provider vocabulary | high if evidence boundaries blur |
| Deployment docs/assets | common playbook plus provider appendices | medium |
| Bootstrap | idempotent cloud-init/installer and completion signal | high; privileged first boot |
| Provider tooling | capability adapters, inventory and cleanup | high; paid external effects |
| Core runtime | none expected | introducing provider branches is a stop condition |
| Licensing/fulfillment | no change expected | any change requires a new decision and Website contract |
| Verification | fake adapters plus disposable live provider runs | high but bounded per increment |

### TDR implication

TDR-044 is narrowly amended by G-107 to freeze the compatible-VM playbook,
secret-free bootstrap, optional-IaC/customer-owned-state boundary, three support
labels and the G-086 evidence threshold. A hosted Relay control plane,
multi-Host Fleet authority, shared tenant data plane, or online entitlement
service remains a different architecture and must not enter these goals
implicitly.

### Recommendation

Proceed with G-108. Make the playbook useful without mandatory IaC, then add
optional OpenTofu modules only where they reduce repeatability/support cost.
Treat each provider profile as independently verified and preserve Marketplace
as a later distribution channel. G-086 may claim only the exact supported list
after G-108 plus DigitalOcean, AWS Lightsail and Azure receipts are accepted.

---

*Generated by `/architect` — Integration Analysis mode*
