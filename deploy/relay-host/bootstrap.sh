#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

STATE_DIR="/var/lib/relay-host-portable"
RECEIPT="$STATE_DIR/bootstrap.json"
LOG="$STATE_DIR/bootstrap.log"
PUBLIC_ENV="/etc/relay-host-portable.env"
mkdir -p "$STATE_DIR"
touch "$LOG"
chmod 0600 "$LOG"
exec > >(tee -a "$LOG") 2>&1

write_failure() {
  local exit_code="$1"
  local line="$2"
  local reason_code="${3:-PORTABLE_BOOTSTRAP_FAILED}"
  printf '{"schema":"orionfold.relay-host-bootstrap-receipt/v1","status":"failed","reasonCode":"%s","exitCode":%s,"line":%s,"log":"%s"}\n' \
    "$reason_code" "$exit_code" "$line" "$LOG" > "$RECEIPT"
  chmod 0600 "$RECEIPT"
}
trap 'code=$?; write_failure "$code" "$LINENO"; exit "$code"' ERR

refuse() {
  local reason_code="$1"
  local message="$2"
  local exit_code="$3"
  local line="$4"
  echo "${reason_code}: ${message}" >&2
  write_failure "$exit_code" "$line" "$reason_code"
  trap - ERR
  exit "$exit_code"
}

if [[ "${EUID}" -ne 0 ]]; then
  refuse "PORTABLE_BOOTSTRAP_ROOT_REQUIRED" "run the checked bootstrap as root." 40 "$LINENO"
fi
if [[ ! -r "$PUBLIC_ENV" ]]; then
  refuse "PORTABLE_BOOTSTRAP_ENV_MISSING" "$PUBLIC_ENV is required." 41 "$LINENO"
fi
# shellcheck disable=SC1090
source "$PUBLIC_ENV"

required=(RELAY_VERSION CELL_IMAGE NODE_VERSION NODE_ARCHIVE_SHA256 COSIGN_VERSION COSIGN_SHA256)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    refuse "PORTABLE_BOOTSTRAP_INPUT_MISSING" "$name is required." 42 "$LINENO"
  fi
done
if [[ ! "$RELAY_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  refuse "PORTABLE_BOOTSTRAP_RELEASE_INVALID" "exact Relay semver required." 43 "$LINENO"
fi
if [[ ! "$CELL_IMAGE" =~ ^ghcr\.io/orionfold/relay-cell@sha256:[a-f0-9]{64}$ ]]; then
  refuse "PORTABLE_BOOTSTRAP_CELL_IMAGE_INVALID" "immutable Relay Cell digest required." 44 "$LINENO"
fi

# The bootstrap itself enforces the public compatible-VM contract before any
# package mutation. A provider saying “running” is not evidence of this result.
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "24.04" ]]; then
  refuse "PORTABLE_SUBSTRATE_OS_UNSUPPORTED" "Ubuntu 24.04 is required." 45 "$LINENO"
fi
if [[ "$(uname -m)" != "x86_64" ]]; then
  refuse "PORTABLE_SUBSTRATE_ARCH_UNSUPPORTED" "x86_64 is required." 46 "$LINENO"
fi
if [[ "$(nproc)" -lt 2 ]]; then
  refuse "PORTABLE_SUBSTRATE_CPU_INSUFFICIENT" "at least 2 vCPU are required." 47 "$LINENO"
fi
memory_kib="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
if [[ "$memory_kib" -lt 4194304 ]]; then
  refuse "PORTABLE_SUBSTRATE_MEMORY_INSUFFICIENT" "at least 4 GiB RAM are required." 48 "$LINENO"
fi
disk_kib="$(df -k --output=size / | tail -1 | tr -d ' ')"
# The disposable local Docker fixture can be smaller than the customer minimum.
# A deterministic disk fact may be supplied only in no-mutation dry-run mode;
# production bootstrap always trusts the machine's actual filesystem.
if [[ "${RELAY_PORTABLE_DRY_RUN:-0}" == "1" && -n "${RELAY_PORTABLE_TEST_DISK_KIB:-}" ]]; then
  disk_kib="$RELAY_PORTABLE_TEST_DISK_KIB"
fi
if [[ "$disk_kib" -lt 83886080 ]]; then
  refuse "PORTABLE_SUBSTRATE_DISK_INSUFFICIENT" "at least 80 GiB disk is required." 49 "$LINENO"
fi

if [[ "${RELAY_PORTABLE_DRY_RUN:-0}" == "1" ]]; then
  printf '{"schema":"orionfold.relay-host-bootstrap-receipt/v1","status":"prepared","reasonCode":"PORTABLE_BOOTSTRAP_DRY_RUN_PREPARED","relayVersion":"%s","cellImage":"%s","dryRun":true,"log":"%s"}\n' \
    "$RELAY_VERSION" "$CELL_IMAGE" "$LOG" > "$RECEIPT"
  chmod 0600 "$RECEIPT"
  trap - ERR
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl docker.io jq openssl tar xz-utils >/dev/null
systemctl enable --now docker

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"

if [[ "$(node --version 2>/dev/null || true)" != "v${NODE_VERSION}" ]]; then
  node_archive="node-v${NODE_VERSION}-linux-x64.tar.xz"
  curl --fail --silent --show-error --location --output "$node_archive" \
    "https://nodejs.org/dist/v${NODE_VERSION}/${node_archive}"
  printf '%s  %s\n' "$NODE_ARCHIVE_SHA256" "$node_archive" | sha256sum -c -
  tar -xJf "$node_archive" -C /usr/local --strip-components=1
fi

if ! cosign version 2>/dev/null | grep -q "GitVersion:[[:space:]]*v${COSIGN_VERSION}$"; then
  curl --fail --silent --show-error --location --output cosign-linux-amd64 \
    "https://github.com/sigstore/cosign/releases/download/v${COSIGN_VERSION}/cosign-linux-amd64"
  printf '%s  %s\n' "$COSIGN_SHA256" cosign-linux-amd64 | sha256sum -c -
  install -m 0755 cosign-linux-amd64 /usr/local/bin/cosign
fi

id relay >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/relay --shell /usr/sbin/nologin relay
if id -nG relay | tr ' ' '\n' | grep -Eq '^(sudo|wheel)$'; then
  refuse "PORTABLE_BOOTSTRAP_RUNTIME_PRIVILEGED" "the relay runtime account must not have sudo or wheel membership." 53 "$LINENO"
fi
usermod -aG docker relay
install -d -m 0700 -o relay -g relay \
  /srv/relay-host /srv/relay-host/releases \
  /srv/relay-host/data /srv/relay-host/supervisor

npm install --global --no-audit --no-fund "orionfold-relay@${RELAY_VERSION}" >/dev/null
global_relay="$(npm root -g)/orionfold-relay"
release_dir="/srv/relay-host/releases/${RELAY_VERSION}"
if [[ ! -d "$release_dir" ]]; then
  cp -a "$global_relay" "$release_dir"
  chown -R relay:relay "$release_dir"
fi
installed_version="$(node -p "require('${release_dir}/package.json').version")"
if [[ "$installed_version" != "$RELAY_VERSION" ]]; then
  refuse "PORTABLE_BOOTSTRAP_RELEASE_MISMATCH" "installed Relay version differs." 50 "$LINENO"
fi
if [[ -e /srv/relay-host/app && ! -L /srv/relay-host/app ]]; then
  refuse "PORTABLE_BOOTSTRAP_ACTIVE_INSTALL_CONFLICT" "/srv/relay-host/app is not a managed release link." 51 "$LINENO"
fi
if [[ -L /srv/relay-host/app && "$(readlink -f /srv/relay-host/app)" != "$release_dir" ]]; then
  refuse "PORTABLE_BOOTSTRAP_ACTIVE_INSTALL_CONFLICT" "a different Relay release is active; use the documented update flow." 52 "$LINENO"
fi
ln -sfn "$release_dir" /srv/relay-host/app

cosign verify "$CELL_IMAGE" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github\.com/orionfold/relay/\.github/workflows/publish-relay-cell\.yml@refs/tags/cell-v[0-9]+\.[0-9]+\.[0-9]+$' >/dev/null
cosign verify-attestation "$CELL_IMAGE" \
  --type https://slsa.dev/provenance/v1 \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github\.com/orionfold/relay/\.github/workflows/publish-relay-cell\.yml@refs/tags/cell-v[0-9]+\.[0-9]+\.[0-9]+$' >/dev/null

printf '{"schema":"orionfold.relay-host-bootstrap-receipt/v1","status":"prepared","reasonCode":"PORTABLE_BOOTSTRAP_PREPARED","relayVersion":"%s","cellImage":"%s","nodeVersion":"%s","cosignVersion":"%s","app":"/srv/relay-host/app","data":"/srv/relay-host/data","supervisor":"/srv/relay-host/supervisor","log":"%s"}\n' \
  "$installed_version" "$CELL_IMAGE" "$(node --version)" "$COSIGN_VERSION" "$LOG" > "$RECEIPT"
chmod 0600 "$RECEIPT"
trap - ERR

echo "PORTABLE_BOOTSTRAP_PREPARED: prerequisites and exact Relay artifacts are ready."
echo "No public Relay service, license, ingress secret, or model credential was configured."
