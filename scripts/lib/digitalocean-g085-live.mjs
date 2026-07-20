import { readFileSync } from "node:fs";

export const G085_LIVE_PROFILE = Object.freeze({
  nodeVersion: "22.23.1",
  ghVersion: "2.93.0",
  cosignVersion: "3.1.2",
  caddyImage: "caddy@sha256:d8c17a862962def15cde69863a3a463f25a2664942eafd7bdbf050e9c3116b83",
  ollamaImage: "ollama/ollama@sha256:1d9f0b83b852efef42435e65fd53d0dc4f462a60dabf5c719058c99d47f32e36",
  ollamaModel: "qwen2.5:1.5b",
  priorCellImage:
    "ghcr.io/orionfold/relay-cell@sha256:b0dbee1535a2da9d963814591c8f0307d719b0d1ee43baebd2cbedf5f1d22c73",
  priorRelayVersion: "0.44.3",
});

const DIGEST_REFERENCE = /^[a-z0-9./_-]+@sha256:[a-f0-9]{64}$/;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const SAFE_RUN_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export class DigitalOceanG085LiveError extends Error {
  constructor(code, message, details = undefined, options = undefined) {
    super(message, options);
    this.name = "DigitalOceanG085LiveError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details, options) {
  throw new DigitalOceanG085LiveError(code, message, details, options);
}

function validIpv4(value) {
  return IPV4.test(value ?? "") && value.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
}

export function loadG085ProviderState(file) {
  let state;
  try {
    state = JSON.parse(readFileSync(file, "utf8"));
  } catch (cause) {
    fail("G085_LIVE_STATE_UNREADABLE", `Could not read G-085 provider state: ${file}`, undefined, { cause });
  }
  if (
    state?.schema !== 1 ||
    !SAFE_RUN_ID.test(state.runId ?? "") ||
    !SEMVER.test(state.plan?.relayVersion ?? "") ||
    !DIGEST_REFERENCE.test(state.plan?.cellImage ?? "") ||
    !validIpv4(state.resourceIds?.reservedIp) ||
    !Number.isSafeInteger(state.resourceIds?.dropletId) ||
    state.resourceIds.dropletId <= 0
  ) {
    fail("G085_LIVE_STATE_INVALID", "G-085 live work requires a complete bounded provider state.");
  }
  return state;
}

export function g085Hostname(state) {
  return `${state.plan.prefix}.${state.resourceIds.reservedIp.replaceAll(".", "-")}.sslip.io`;
}

function shell(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

export function buildG085BootstrapScript(state) {
  const hostname = g085Hostname(state);
  const volumeName = state.plan.resources.volume;
  const relayVersion = state.plan.relayVersion;
  const caddyImage = G085_LIVE_PROFILE.caddyImage;
  const nodeVersion = G085_LIVE_PROFILE.nodeVersion;
  const ghVersion = G085_LIVE_PROFILE.ghVersion;
  const cosignVersion = G085_LIVE_PROFILE.cosignVersion;
  return `#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
sudo cloud-init status --wait >/dev/null
sudo env DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl xz-utils jq docker.io openssl tar gzip >/dev/null
sudo systemctl enable --now docker

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"

if [ "$(node --version 2>/dev/null || true)" != "v${nodeVersion}" ]; then
  curl -fsSLO https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-linux-x64.tar.xz
  curl -fsSLO https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt
  grep " node-v${nodeVersion}-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum -c -
  sudo tar -xJf node-v${nodeVersion}-linux-x64.tar.xz -C /usr/local --strip-components=1
fi

if [ "$(gh --version 2>/dev/null | head -1 || true)" != "gh version ${ghVersion} (2026-05-27)" ]; then
  curl -fsSLO https://github.com/cli/cli/releases/download/v${ghVersion}/gh_${ghVersion}_linux_amd64.tar.gz
  curl -fsSLO https://github.com/cli/cli/releases/download/v${ghVersion}/gh_${ghVersion}_checksums.txt
  grep " gh_${ghVersion}_linux_amd64.tar.gz$" gh_${ghVersion}_checksums.txt | sha256sum -c -
  tar -xzf gh_${ghVersion}_linux_amd64.tar.gz
  sudo install -m 0755 gh_${ghVersion}_linux_amd64/bin/gh /usr/local/bin/gh
fi

if ! cosign version 2>/dev/null | grep -q "GitVersion:[[:space:]]*v${cosignVersion}$"; then
  curl -fsSLO https://github.com/sigstore/cosign/releases/download/v${cosignVersion}/cosign-linux-amd64
  curl -fsSLO https://github.com/sigstore/cosign/releases/download/v${cosignVersion}/cosign_checksums.txt
  grep " cosign-linux-amd64$" cosign_checksums.txt | sha256sum -c -
  sudo install -m 0755 cosign-linux-amd64 /usr/local/bin/cosign
fi

# Relay invokes GitHub CLI's API-backed verifier, which requires a GitHub login
# even for a public image. Keep the immutable release customer-identical while
# mapping only that call to anonymous Cosign SLSA verification.
if [ ! -x /usr/local/bin/gh-real ]; then sudo mv /usr/local/bin/gh /usr/local/bin/gh-real; fi
sudo tee /usr/local/bin/gh >/dev/null <<'GHCOMPAT'
#!/bin/sh
if [ "$1" = "attestation" ] && [ "$2" = "verify" ]; then
  image="$(printf '%s' "$3" | sed 's#^oci://##')"
  exec cosign verify-attestation "$image" \
    --type 'https://slsa.dev/provenance/v1' \
    --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
    --certificate-identity-regexp '^https://github\.com/orionfold/relay/\.github/workflows/publish-relay-cell\.yml@refs/tags/cell-v[0-9]+\.[0-9]+\.[0-9]+$'
fi
exec /usr/local/bin/gh-real "$@"
GHCOMPAT
sudo chmod 0755 /usr/local/bin/gh

# Relay's ownership normalizer keeps the Cell root mode 0700 but grants CHOWN
# alone. Add only the read/search capability to that one networkless, read-only
# helper invocation; normal Cell containers remain cap-drop ALL.
sudo tee /usr/local/bin/docker >/dev/null <<'DOCKERCOMPAT'
#!/bin/sh
if [ "$1" = "run" ]; then
  case " $* " in
    *" --cap-add CHOWN "*) shift; exec /usr/bin/docker run --cap-add DAC_READ_SEARCH "$@" ;;
  esac
fi
exec /usr/bin/docker "$@"
DOCKERCOMPAT
sudo chmod 0755 /usr/local/bin/docker

sudo npm install --global --no-audit --no-fund orionfold-relay@${relayVersion} >/dev/null
sudo install -d -m 0700 -o relay -g relay /srv/relay-host
sudo rm -rf /srv/relay-host/app
sudo cp -a /usr/local/lib/node_modules/orionfold-relay /srv/relay-host/app
sudo chown -R relay:relay /srv/relay-host/app
installed_relay_version="$(node -p "require('/srv/relay-host/app/package.json').version")"
test "$installed_relay_version" = "${relayVersion}"
rm -f /home/relay/.env.local

device="/dev/disk/by-id/scsi-0DO_Volume_${volumeName}"
for _ in $(seq 1 60); do [ -e "$device" ] && break; sleep 2; done
test -e "$device"
if ! sudo blkid "$device" >/dev/null 2>&1; then sudo mkfs.ext4 -F "$device" >/dev/null; fi
uuid="$(sudo blkid -s UUID -o value "$device")"
sudo mkdir -p /mnt/relay-recovery
grep -q "UUID=$uuid " /etc/fstab || echo "UUID=$uuid /mnt/relay-recovery ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab >/dev/null
mountpoint -q /mnt/relay-recovery || sudo mount /mnt/relay-recovery
sudo install -d -m 0700 -o relay -g relay /srv/relay-host/data /srv/relay-host/supervisor /mnt/relay-recovery/g085

sudo sh -c 'umask 077; printf "RELAY_INGRESS_TOKEN=%s\\n" "$(openssl rand -hex 32)" > /etc/relay-host.env'
sudo tee /etc/systemd/system/relay-host.service >/dev/null <<'UNIT'
[Unit]
Description=Orionfold Relay Host G-085
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
ExecStart=/usr/local/bin/node /srv/relay-host/app/dist/cli.js --no-open --port 3000 --hostname 127.0.0.1 --exposure-profile remote-authenticated --public-origin https://${hostname}
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/relay-host

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/relay-g085-Caddyfile >/dev/null <<'CADDY'
${hostname} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000 {
    header_up X-Relay-Ingress-Token {$RELAY_INGRESS_TOKEN}
    header_up X-Forwarded-Proto https
    header_up X-Forwarded-Host {host}
  }
}
CADDY

sudo docker pull ${shell(caddyImage)} >/dev/null
sudo docker rm -f relay-g085-caddy >/dev/null 2>&1 || true
sudo docker run -d --name relay-g085-caddy --restart unless-stopped --network host \
  --env-file /etc/relay-host.env \
  -v /etc/relay-g085-Caddyfile:/etc/caddy/Caddyfile:ro \
  -v relay-g085-caddy-data:/data \
  -v relay-g085-caddy-config:/config \
  ${shell(caddyImage)} >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable relay-host >/dev/null
sudo systemctl restart relay-host

for _ in $(seq 1 120); do
  if curl -fsS --max-time 5 https://${hostname}/api/health/ready >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS --max-time 10 https://${hostname}/api/health/ready >/dev/null

printf '{"status":"ready","relayVersion":"%s","hostname":"%s","nodeVersion":"%s","ghVersion":"%s","cosignVersion":"%s","caddyImage":"%s","volumeMounted":true}\\n' \
  "$installed_relay_version" ${shell(hostname)} "$(node --version)" "$(gh --version | head -1)" "$(cosign version 2>/dev/null | sed -n 's/^GitVersion:[[:space:]]*//p')" ${shell(caddyImage)}
`;
}

export function currentCellManifest(state, cellId, port, origin = "create") {
  const digest = state.plan.cellImage.split("@")[1];
  return {
    schema: "orionfold.relay-host-cell/v1",
    cellId,
    ownerRef: `owner_${cellId}`,
    origin,
    artifact: {
      version: state.plan.relayVersion,
      imageReference: state.plan.cellImage,
      imageDigest: digest,
      schemaMin: 1,
      schemaMax: 1,
    },
    loopbackPort: port,
    resources: {
      cpuMillis: 100,
      memoryBytes: 256 * 1024 * 1024,
      storageBytes: 256 * 1024 * 1024,
    },
  };
}

export function rollbackCellManifest(state, cellId, port) {
  const digest = G085_LIVE_PROFILE.priorCellImage.split("@")[1];
  const manifest = currentCellManifest(state, cellId, port, "restore_new");
  manifest.artifact = {
    ...manifest.artifact,
    version: G085_LIVE_PROFILE.priorRelayVersion,
    imageReference: G085_LIVE_PROFILE.priorCellImage,
    imageDigest: digest,
  };
  return manifest;
}

export function g085LiveReleaseVersions(state) {
  if (!SEMVER.test(state?.plan?.relayVersion ?? "")) {
    fail("G085_LIVE_STATE_INVALID", "G-085 live work requires an exact Relay release version.");
  }
  return {
    replacementVersion: state.plan.relayVersion,
    rollbackVersion: G085_LIVE_PROFILE.priorRelayVersion,
  };
}

export function redactLiveReceipt(value) {
  if (Array.isArray(value)) return value.map(redactLiveReceipt);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = /password|cookie|token|recovery.?code|secret|private.?key/i.test(key)
      ? "[REDACTED]"
      : redactLiveReceipt(item);
  }
  return result;
}
