# Run a Relay Host on DigitalOcean (guided beta)

This guide runs one licensed Relay Host and its managed Relay Cells on a
customer-owned DigitalOcean Droplet. It is a guided, manual beta: Relay does not
ask for your DigitalOcean token, create infrastructure, control your bill, or
operate the server for you.

Use the copy of this guide from the same Git tag as your Relay release. The
validated baseline is one Ubuntu 24.04 x64 Droplet with 2 vCPU, 4 GiB RAM and
80 GiB local disk. A separate block volume is recommended for encrypted
recovery bundles. That size proves the Relay Host and lightweight Cells; it is
not a production sizing promise for a local LLM. Use BYOK hosted inference or
size a private model server separately.

## What you own

You own the DigitalOcean account and bill, SSH access, hostname and DNS, firewall,
backups, model/API credentials, recovery keys and day-to-day administration.
Orionfold supplies the npm-delivered Relay Host, the public signed Relay Cell
image, the offline signed Host license and this tested topology. Every resident
Cell trusts the Host administrator. Put customers that do not accept that trust
on separate Droplets or Hosts.

## 1. Create the server with a spending guardrail

Before creating resources, set a DigitalOcean billing alert at the amount you
are prepared to spend. DigitalOcean bills the infrastructure in your account;
Relay's estimate is guidance, not the bill.

Create these resources in one region:

1. An Ubuntu 24.04 x64 Droplet with at least 2 vCPU, 4 GiB RAM and 80 GiB disk.
2. An SSH key. Disable password and root SSH access after confirming the
   non-root account works.
3. A Cloud Firewall that allows SSH (`22/tcp`) only from your administrator IP,
   and HTTPS (`443/tcp`) plus HTTP (`80/tcp`, for certificate issuance) from
   clients. Do not expose Relay's port `3000`, Cell ports, Docker, Ollama or a
   database port.
4. A hostname such as `relay.example.com` whose A record points to the Droplet.
5. Optionally, a block volume mounted at `/mnt/relay-recovery`. Store the
   recovery key somewhere else.

The operator account in the validated run is named `relay`. Create it through
cloud-init or the DigitalOcean console with your SSH key, sudo access and no
password login. After connecting as that user:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl docker.io jq openssl
sudo systemctl enable --now docker
sudo usermod -aG docker relay
sudo install -d -m 0700 -o relay -g relay \
  /srv/relay-host /srv/relay-host/data /srv/relay-host/supervisor
```

Sign out and back in so the Docker group change takes effect. Membership in the
Docker group is effectively root authority; grant it only to trusted Host
administrators.

Install a supported Node.js release (Node 22 or newer; the validated run uses
Node 22) and Cosign using their official installation instructions. Then check:

```bash
node --version
npm --version
docker version
cosign version
```

## 2. Install an exact Relay release

Set `RELAY_VERSION` to the release named in your fulfillment message or GitHub
Release. Do not use an unreviewed prerelease:

```bash
export RELAY_VERSION='<X.Y.Z>'
sudo npm install --global --no-audit --no-fund "orionfold-relay@$RELAY_VERSION"
relay --version
```

The first production start expands part of the prebuilt Next.js application.
Copy the exact installed package into a service-owned directory so that work is
not attempted inside the root-owned global npm tree:

```bash
GLOBAL_RELAY="$(npm root -g)/orionfold-relay"
sudo rm -rf /srv/relay-host/app
sudo cp -a "$GLOBAL_RELAY" /srv/relay-host/app
sudo chown -R relay:relay /srv/relay-host/app
node -p "require('/srv/relay-host/app/package.json').version"
```

The printed version must equal `RELAY_VERSION`. Stop if it does not.

## 3. Put Relay behind authenticated HTTPS

Create one high-entropy ingress secret shared only by Relay and the reverse
proxy:

```bash
sudo sh -c 'umask 077; printf "RELAY_INGRESS_TOKEN=%s\n" "$(openssl rand -hex 32)" > /etc/relay-host.env'
```

Replace `relay.example.com` below with your hostname:

```ini
# /etc/systemd/system/relay-host.service
[Unit]
Description=Orionfold Relay Host
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=relay
Group=relay
EnvironmentFile=/etc/relay-host.env
Environment=RELAY_DATA_DIR=/srv/relay-host/data
Environment=RELAY_HOST_ROOT=/srv/relay-host/supervisor
ExecStart=/usr/bin/env node /srv/relay-host/app/dist/cli.js --no-open --port 3000 --hostname 127.0.0.1 --exposure-profile remote-authenticated --public-origin https://relay.example.com
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/relay-host

[Install]
WantedBy=multi-user.target
```

Configure Caddy or another TLS reverse proxy to listen on `80/443`, forward
only to `127.0.0.1:3000`, and add the same secret as
`X-Relay-Ingress-Token`. For Caddy:

```caddyfile
relay.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000 {
    header_up X-Relay-Ingress-Token {$RELAY_INGRESS_TOKEN}
    header_up X-Forwarded-Proto https
    header_up X-Forwarded-Host {host}
  }
}
```

The validated beta runs Caddy as this exact-digest container, sharing the
root-readable Relay ingress environment without publishing Relay's port:

```bash
export RELAY_CADDY_IMAGE='caddy@sha256:d8c17a862962def15cde69863a3a463f25a2664942eafd7bdbf050e9c3116b83'
sudo install -m 0600 -o root -g root ./Caddyfile /etc/relay-Caddyfile
sudo docker pull "$RELAY_CADDY_IMAGE"
sudo docker run -d --name relay-caddy --restart unless-stopped --network host \
  --env-file /etc/relay-host.env \
  -v /etc/relay-Caddyfile:/etc/caddy/Caddyfile:ro \
  -v relay-caddy-data:/data \
  -v relay-caddy-config:/config \
  "$RELAY_CADDY_IMAGE"
```

Then start Relay:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now relay-host
sudo systemctl status relay-host --no-pager
curl -fsS https://relay.example.com/api/health/ready
```

`HOST_INGRESS_TOKEN_MISSING`, `HOST_INGRESS_AUTH_FAILED`, an origin mismatch or
a non-loopback Relay listener is a release-blocking configuration error. Do not
work around it by opening port 3000.

## 4. Create the first administrator and add the Host license

On the server, generate the single-use 15-minute bootstrap credential:

```bash
sudo -u relay env RELAY_DATA_DIR=/srv/relay-host/data \
  node /srv/relay-host/app/dist/cli.js auth bootstrap
```

Open `https://relay.example.com`, enter the credential, choose a password of at
least 12 characters, and save all eight recovery codes somewhere protected.
Under **Settings → Access & sessions**, confirm and name the browser session.

Copy the signed `product:relay-host` license file to the server, then redeem it
offline:

```bash
sudo -u relay env RELAY_DATA_DIR=/srv/relay-host/data \
  node /srv/relay-host/app/dist/cli.js license add /path/to/relay-host.license.json
sudo -u relay env RELAY_DATA_DIR=/srv/relay-host/data \
  node /srv/relay-host/app/dist/cli.js license status
```

A license file is not a registry password. A missing or lapsed license blocks
new managed Cells but never stops existing Cells or blocks export/recovery.

## 5. Initialize the Host and create Cells

In **Settings → Relay Host deployment**, choose **Local device**: from Relay's
perspective the Droplet is the local Host. The separate **Cloud server preview**
is only a planning simulation and must not be used as if it created this VM.
Review the estimate, preflight, authorize and install the Host.

The validated 2-vCPU/4-GiB baseline uses these physical limits at the CLI:

```bash
relay host init \
  --host-root /srv/relay-host/supervisor \
  --license-dir /srv/relay-host/data/licenses \
  --host-id relay-do-host \
  --cpu-millis 2000 \
  --memory-bytes 4294967296 \
  --storage-bytes 85899345920 \
  --reserve-percent 20
relay host inventory \
  --host-root /srv/relay-host/supervisor \
  --license-dir /srv/relay-host/data/licenses
```

Create and manage Cells through Settings or the strict manifest workflow in
[Relay Host supervisor](./relay-host-supervisor.md). Relay pins the Cell image
by immutable digest and verifies its Cosign signature and SLSA provenance
anonymously before the first pull. Stop on `HOST_ARTIFACT_*`,
`HOST_RUNTIME_*`, `HOST_CAPACITY_EXCEEDED` or `HOST_GRANT_MANAGED_CELL_LIMIT`;
do not switch the manifest to a mutable tag or disable verification.

Configure BYOK or a private runtime under **Settings → Model runtimes**. The
baseline does not include a production-sized Ollama, LM Studio or LiteLLM
server. If the runtime is elsewhere on a private network, test that exact URL
from Relay before routing tasks to it.

## 6. Configure and prove recovery

Create the key outside both the Relay data directory and backup destination:

```bash
relay recovery key create --out /secure-keys/relay-cell-a.key
relay recovery create \
  --destination /mnt/relay-recovery/relay-cell-a \
  --key-file /secure-keys/relay-cell-a.key
relay recovery verify \
  --bundle /mnt/relay-recovery/relay-cell-a/<bundle>.relay-recovery \
  --key-file /secure-keys/relay-cell-a.key
relay recovery drill \
  --bundle /mnt/relay-recovery/relay-cell-a/<bundle>.relay-recovery \
  --key-file /secure-keys/relay-cell-a.key
```

Keep a protected copy of the key away from the Droplet and volume. A completed
bundle is not enough: periodically restore it into an empty disposable data
root and prove sign-in plus representative data. See
[Relay Cell encrypted recovery](./relay-cell-recovery.md).

## 7. Update, roll back or remove the beta

Before an update, create and verify a recovery bundle. Install the new exact npm
version, copy it into `/srv/relay-host/app`, verify its version, restart the
service, and run `relay host reconcile`. Do not update an existing Cell manifest
to a new digest until that release's compatibility and recovery checks pass.
Rollback means reinstalling the prior supported exact npm version and using its
accepted immutable Cell digest; tags are never moved to fake a rollback.

For complete teardown:

1. Export or permanently purge every managed Cell through the Host lifecycle.
2. Confirm `relay host inventory` contains no resident Cell you need.
3. Stop Relay and the reverse proxy; remove their containers and named volumes.
4. Copy recovery bundles off the Droplet and verify the copy.
5. Delete the Droplet, attached block volume, reserved IP, firewall and
   disposable DNS record in DigitalOcean.
6. Confirm DigitalOcean shows no remaining billable resource and revoke the
   disposable SSH key or provider token used during setup.

Existing Cells must not be destroyed merely because a license lapses. Export
and recovery remain available. If cleanup is incomplete, keep a list of the
exact resource IDs and finish it before treating the beta environment as gone.

## Support boundary

The beta supports the topology and release checks above. It does not promise
one-click provisioning, Marketplace installation, a Fleet Controller,
multi-provider portability, hostile isolation from the Host administrator,
managed Orionfold infrastructure, an uptime/SLA, an RPO/RTO, or production LLM
throughput on the baseline Droplet. Include the Relay version, Cell digest,
named error code, `systemctl status relay-host`, `relay host inventory` and a
content-redacted recovery receipt when requesting support.

Related references: [ingress and administrator access](./relay-host-access.md),
[Cell OCI acquisition and verification](./relay-cell-oci-release.md),
[Host fulfillment](./relay-host-fulfillment.md), and
[Relay Host supervisor](./relay-host-supervisor.md).
