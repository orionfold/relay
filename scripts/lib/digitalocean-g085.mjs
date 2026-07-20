import { setTimeout as delay } from "node:timers/promises";

const API_BASE = "https://api.digitalocean.com/v2";
const RUN_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const IPV4_CIDR = /^(?:\d{1,3}\.){3}\d{1,3}\/32$/;
const APPROVED_PROFILE = Object.freeze({
  region: "sfo3",
  size: "s-2vcpu-4gb",
  image: "ubuntu-24-04-x64",
  volumeGiB: 10,
  priceMonthlyUsd: 24,
  priceHourlyUsd: 0.03571,
});

export class DigitalOceanG085Error extends Error {
  constructor(code, message, details = undefined, options = undefined) {
    super(message, options);
    this.name = "DigitalOceanG085Error";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details, options) {
  throw new DigitalOceanG085Error(code, message, details, options);
}

function assertRunId(runId) {
  if (!RUN_ID.test(runId)) {
    fail("G085_RUN_ID_INVALID", "Run ID must be a lowercase DNS-safe label of at most 32 characters.");
  }
}

function assertSshCidr(value) {
  if (!IPV4_CIDR.test(value)) {
    fail("G085_SSH_CIDR_INVALID", "SSH source must be one public IPv4 /32 CIDR.");
  }
  const valid = value.slice(0, -3).split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
  if (!valid) fail("G085_SSH_CIDR_INVALID", "SSH source contains an invalid IPv4 address.");
}

function isIpv4(value) {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value ?? "")) return false;
  return value.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
}

function assertProviderId(value, name, kind) {
  if (value === null) return;
  const valid = kind === "integer"
    ? Number.isSafeInteger(value) && value > 0
    : typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(value);
  if (!valid) fail("G085_STATE_INVALID", `G-085 state contains an invalid ${name}.`);
}

function assertPublicKey(value) {
  if (!/^ssh-(?:ed25519|rsa) [A-Za-z0-9+/=]+(?: [A-Za-z0-9._@+-]{1,80})?$/.test(value)) {
    fail("G085_SSH_PUBLIC_KEY_INVALID", "A valid disposable SSH public key is required.");
  }
}

function cloudInitPublicKey(value) {
  assertPublicKey(value);
  return value.split(" ").slice(0, 2).join(" ");
}

async function noCheckpoint() {}

export function resourcePrefix(runId) {
  assertRunId(runId);
  return `relay-g085-${runId}`;
}

export function createG085Plan({
  runId,
  region = "sfo3",
  size = "s-2vcpu-4gb",
  image = "ubuntu-24-04-x64",
  volumeGiB = 10,
  relayVersion,
  cellImage,
  sshSourceCidr,
}) {
  const prefix = resourcePrefix(runId);
  assertSshCidr(sshSourceCidr);
  if (region !== APPROVED_PROFILE.region || size !== APPROVED_PROFILE.size || image !== APPROVED_PROFILE.image) {
    fail(
      "G085_PROFILE_UNAPPROVED",
      `G-085 is fixed to ${APPROVED_PROFILE.region}, ${APPROVED_PROFILE.size}, ${APPROVED_PROFILE.image}.`,
    );
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(relayVersion ?? "")) {
    fail("G085_RELEASE_VERSION_INVALID", "A released Relay semantic version is required.");
  }
  if (!/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(cellImage ?? "")) {
    fail("G085_CELL_IMAGE_INVALID", "Cell image must be an immutable GHCR sha256 reference.");
  }
  if (volumeGiB !== APPROVED_PROFILE.volumeGiB) {
    fail("G085_VOLUME_SIZE_INVALID", `The approved G-085 recovery volume is exactly ${APPROVED_PROFILE.volumeGiB} GiB.`);
  }
  return {
    schema: 1,
    runId,
    prefix,
    region,
    size,
    image,
    volumeGiB,
    relayVersion,
    cellImage,
    sshSourceCidr,
    resources: {
      sshKey: `${prefix}-key`,
      firewall: `${prefix}-firewall`,
      volume: `${prefix}-recovery`,
      droplet: `${prefix}-host`,
    },
    approvedMonthlyCapUsd: APPROVED_PROFILE.priceMonthlyUsd,
    approvedRunCeilingUsd: 10,
  };
}

export function createG085State(plan, now = new Date()) {
  return {
    schema: 1,
    runId: plan.runId,
    plan,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    resourceIds: {
      sshKeyId: null,
      firewallId: null,
      reservedIp: null,
      volumeId: null,
      dropletId: null,
    },
    reservedIpBaseline: null,
    cleanupIds: null,
    receipts: [],
  };
}

export function validateG085State(state) {
  if (state?.schema !== 1 || !state?.plan || !state?.resourceIds || !Array.isArray(state?.receipts)) {
    fail("G085_STATE_INVALID", "G-085 state is missing required versioned fields.");
  }
  const expectedPlan = createG085Plan(state.plan);
  if (JSON.stringify(expectedPlan) !== JSON.stringify(state.plan)) {
    fail("G085_STATE_INVALID", "G-085 state plan differs from the approved canonical profile.");
  }
  const ids = state.resourceIds;
  assertProviderId(ids.sshKeyId, "SSH key ID", "integer");
  assertProviderId(ids.dropletId, "Droplet ID", "integer");
  assertProviderId(ids.firewallId, "firewall ID", "opaque");
  assertProviderId(ids.volumeId, "volume ID", "opaque");
  if (ids.reservedIp !== null && !isIpv4(ids.reservedIp)) {
    fail("G085_STATE_INVALID", "G-085 state contains an invalid reserved IP.");
  }
  if (state.reservedIpBaseline != null && (
    !Array.isArray(state.reservedIpBaseline) || !state.reservedIpBaseline.every(isIpv4)
  )) {
    fail("G085_STATE_INVALID", "G-085 state contains an invalid reserved-IP baseline.");
  }
  if (state.cleanupIds != null) {
    assertProviderId(state.cleanupIds.sshKeyId, "cleanup SSH key ID", "integer");
    assertProviderId(state.cleanupIds.dropletId, "cleanup Droplet ID", "integer");
    assertProviderId(state.cleanupIds.firewallId, "cleanup firewall ID", "opaque");
    assertProviderId(state.cleanupIds.volumeId, "cleanup volume ID", "opaque");
    if (state.cleanupIds.reservedIp !== null && !isIpv4(state.cleanupIds.reservedIp)) {
      fail("G085_STATE_INVALID", "G-085 state contains an invalid cleanup reserved IP.");
    }
  }
  return state;
}

export function redactG085(value) {
  if (Array.isArray(value)) return value.map(redactG085);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(?:token|authorization|private.?key|user.?data|password|secret)/i.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactG085(item);
    }
  }
  return result;
}

function receipt(state, stage, reasonCode, details, now = new Date()) {
  state.updatedAt = now.toISOString();
  state.receipts.push(redactG085({ stage, reasonCode, at: state.updatedAt, details }));
  return state;
}

function responseCode(status) {
  if (status === 401 || status === 403) return "G085_PROVIDER_AUTH_FAILED";
  if (status === 404) return "G085_PROVIDER_NOT_FOUND";
  if (status === 409) return "G085_RESOURCE_COLLISION";
  if (status === 422) return "G085_PROVIDER_REQUEST_INVALID";
  if (status === 429 || status >= 500) return "G085_PROVIDER_RETRYABLE";
  return "G085_PROVIDER_REQUEST_FAILED";
}

export class DigitalOceanG085Client {
  constructor({ token, fetchImpl = globalThis.fetch, apiBase = API_BASE, sleep = delay, retries = 2 }) {
    if (!token) fail("G085_PROVIDER_AUTH_FAILED", "DIGITALOCEAN_TOKEN is required.");
    if (typeof fetchImpl !== "function") fail("G085_PROVIDER_CLIENT_INVALID", "A fetch implementation is required.");
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.apiBase = apiBase.replace(/\/$/, "");
    this.sleep = sleep;
    this.retries = retries;
  }

  async request(method, path, { body, expected = [200] } = {}) {
    let last;
    const mayRetry = method === "GET" || method === "PUT" || method === "DELETE";
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      let response;
      try {
        response = await this.fetchImpl(`${this.apiBase}${path}`, {
          method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.token}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          signal: AbortSignal.timeout(15_000),
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch (cause) {
        last = new DigitalOceanG085Error(
          "G085_PROVIDER_RETRYABLE",
          `DigitalOcean ${method} ${path} could not reach the provider.`,
          { attempt: attempt + 1 },
          { cause },
        );
        if (mayRetry && attempt < this.retries) {
          await this.sleep(250 * 2 ** attempt);
          continue;
        }
        throw last;
      }

      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { message: text.slice(0, 300) };
        }
      }
      if (expected.includes(response.status)) return payload;

      const code = responseCode(response.status);
      last = new DigitalOceanG085Error(
        code,
        `DigitalOcean ${method} ${path} returned HTTP ${response.status}: ${payload?.message ?? "request failed"}`,
        { status: response.status, requestId: response.headers.get("x-request-id") ?? null },
      );
      if (mayRetry && (response.status === 429 || response.status >= 500) && attempt < this.retries) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt);
        continue;
      }
      throw last;
    }
    throw last;
  }

  get(path) {
    return this.request("GET", path);
  }

  post(path, body, expected = [201, 202]) {
    return this.request("POST", path, { body, expected });
  }

  put(path, body, expected = [200]) {
    return this.request("PUT", path, { body, expected });
  }

  delete(path) {
    return this.request("DELETE", path, { expected: [204] });
  }

  async list(path, key) {
    const values = [];
    let next = path;
    while (next) {
      const payload = await this.get(next.startsWith("http") ? new URL(next).pathname + new URL(next).search : next);
      values.push(...(payload?.[key] ?? []));
      const nextUrl = payload?.links?.pages?.next ?? null;
      if (nextUrl) {
        const approved = new URL(this.apiBase);
        const candidate = new URL(nextUrl);
        if (candidate.origin !== approved.origin || !candidate.pathname.startsWith(`${approved.pathname}/`)) {
          fail("G085_PROVIDER_PAGINATION_INVALID", "DigitalOcean pagination left the approved API origin or path.");
        }
      }
      next = nextUrl;
    }
    return values;
  }

  async waitForAction(actionId, { timeoutMs = 180_000, intervalMs = 2_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const payload = await this.get(`/actions/${actionId}`);
      const status = payload?.action?.status;
      if (status === "completed") return payload.action;
      if (status === "errored") {
        fail("G085_PROVIDER_ACTION_FAILED", `DigitalOcean action ${actionId} failed.`, { actionId });
      }
      await this.sleep(intervalMs);
    }
    fail("G085_PROVIDER_ACTION_TIMEOUT", `DigitalOcean action ${actionId} did not complete in time.`, { actionId });
  }
}

export async function inventoryG085(client, state) {
  const { prefix, region } = state.plan;
  const [droplets, firewalls, volumes, keys, reservedIps] = await Promise.all([
    client.list("/droplets?per_page=200", "droplets"),
    client.list("/firewalls?per_page=200", "firewalls"),
    client.list(`/volumes?region=${encodeURIComponent(region)}&per_page=200`, "volumes"),
    client.list("/account/keys?per_page=200", "ssh_keys"),
    client.list("/reserved_ips?per_page=200", "reserved_ips"),
  ]);
  const knownIp = state.resourceIds.reservedIp ?? state.cleanupIds?.reservedIp;
  return redactG085({
    droplets: droplets.filter((item) => item.name?.startsWith(prefix)),
    firewalls: firewalls.filter((item) => item.name?.startsWith(prefix)),
    volumes: volumes.filter((item) => item.name?.startsWith(prefix)),
    sshKeys: keys.filter((item) => item.name?.startsWith(prefix)),
    reservedIps: reservedIps.filter((item) => item.ip === knownIp || item.droplet?.name?.startsWith(prefix)),
  });
}

async function oneNamedResource(client, path, key, name) {
  const matches = (await client.list(path, key)).filter((item) => item.name === name);
  if (matches.length > 1) {
    fail("G085_RESOURCE_COLLISION", `DigitalOcean reports more than one resource named ${name}.`, {
      ids: matches.map((item) => item.id),
    });
  }
  return matches[0] ?? null;
}

export async function preflightG085(client, state) {
  const [accountPayload, regions, sizes, inventory] = await Promise.all([
    client.get("/account"),
    client.list("/regions?per_page=200", "regions"),
    client.list("/sizes?per_page=200", "sizes"),
    inventoryG085(client, state),
  ]);
  const region = regions.find((item) => item.slug === state.plan.region);
  const size = sizes.find((item) => item.slug === state.plan.size && item.regions?.includes(state.plan.region));
  if (!region?.available) fail("G085_REGION_UNAVAILABLE", `DigitalOcean region ${state.plan.region} is unavailable.`);
  if (!size?.available) fail("G085_SIZE_UNAVAILABLE", `DigitalOcean size ${state.plan.size} is unavailable in ${state.plan.region}.`);
  if (Object.values(inventory).some((items) => items.length > 0)) {
    fail("G085_RESOURCE_COLLISION", `Resources already exist for ${state.plan.prefix}.`, inventory);
  }
  const account = accountPayload?.account ?? {};
  if (account.status !== "active") {
    fail("G085_ACCOUNT_INACTIVE", `DigitalOcean account status is ${account.status ?? "unknown"}.`);
  }
  const monthly = Number(size.price_monthly);
  const hourly = Number(size.price_hourly);
  if (
    !Number.isFinite(monthly) || !Number.isFinite(hourly) ||
    monthly > APPROVED_PROFILE.priceMonthlyUsd || hourly > APPROVED_PROFILE.priceHourlyUsd
  ) {
    fail("G085_COST_CEILING_EXCEEDED", "DigitalOcean returned a price above the approved G-085 profile.", {
      priceMonthly: size.price_monthly,
      priceHourly: size.price_hourly,
    });
  }
  receipt(state, "preflight", "G085_PREFLIGHT_PASSED", {
    account: {
      status: account.status,
      dropletLimit: account.droplet_limit,
      floatingIpLimit: account.floating_ip_limit,
      volumeLimit: account.volume_limit,
    },
    region: { slug: region.slug, available: region.available },
    size: { slug: size.slug, priceMonthly: size.price_monthly, priceHourly: size.price_hourly },
    inventory,
  });
  return state;
}

export async function createAccessG085(client, state, publicKey, { checkpoint = noCheckpoint } = {}) {
  assertPublicKey(publicKey);
  if (state.resourceIds.sshKeyId) return receipt(state, "access", "G085_ACCESS_REUSED", { sshKeyId: state.resourceIds.sshKeyId });
  const existing = await oneNamedResource(client, "/account/keys?per_page=200", "ssh_keys", state.plan.resources.sshKey);
  if (existing) {
    state.resourceIds.sshKeyId = existing.id;
    await checkpoint(state);
    return receipt(state, "access", "G085_ACCESS_RECONCILED", {
      sshKeyId: existing.id,
      fingerprint: existing.fingerprint,
    });
  }
  const payload = await client.post("/account/keys", { name: state.plan.resources.sshKey, public_key: publicKey }, [201]);
  state.resourceIds.sshKeyId = payload.ssh_key.id;
  await checkpoint(state);
  return receipt(state, "access", "G085_ACCESS_CREATED", {
    sshKeyId: payload.ssh_key.id,
    fingerprint: payload.ssh_key.fingerprint,
  });
}

export async function createNetworkG085(client, state, { checkpoint = noCheckpoint } = {}) {
  if (!state.resourceIds.firewallId) {
    const existing = await oneNamedResource(client, "/firewalls?per_page=200", "firewalls", state.plan.resources.firewall);
    if (existing) {
      state.resourceIds.firewallId = existing.id;
      await checkpoint(state);
    } else {
      const payload = await client.post("/firewalls", {
      name: state.plan.resources.firewall,
      inbound_rules: [
        { protocol: "tcp", ports: "22", sources: { addresses: [state.plan.sshSourceCidr] } },
        { protocol: "tcp", ports: "80", sources: { addresses: ["0.0.0.0/0", "::/0"] } },
        { protocol: "tcp", ports: "443", sources: { addresses: ["0.0.0.0/0", "::/0"] } },
      ],
      outbound_rules: [
        { protocol: "tcp", ports: "all", destinations: { addresses: ["0.0.0.0/0", "::/0"] } },
        { protocol: "udp", ports: "all", destinations: { addresses: ["0.0.0.0/0", "::/0"] } },
        { protocol: "icmp", destinations: { addresses: ["0.0.0.0/0", "::/0"] } },
      ],
      droplet_ids: [],
      tags: [],
      }, [202]);
      state.resourceIds.firewallId = payload.firewall.id;
      await checkpoint(state);
    }
  }
  if (!state.resourceIds.reservedIp) {
    const reservedIps = await client.list("/reserved_ips?per_page=200", "reserved_ips");
    if (state.reservedIpBaseline == null) {
      state.reservedIpBaseline = reservedIps.map((item) => item.ip).sort();
      await checkpoint(state);
    }
    const baseline = new Set(state.reservedIpBaseline);
    const candidates = reservedIps.filter((item) =>
      !baseline.has(item.ip) && !item.droplet && item.region?.slug === state.plan.region
    );
    if (candidates.length > 1) {
      fail("G085_RESOURCE_COLLISION", "More than one new unassigned reserved IP appeared after the G-085 baseline.", {
        candidateIps: candidates.map((item) => item.ip),
      });
    }
    if (candidates.length === 1) {
      state.resourceIds.reservedIp = candidates[0].ip;
      await checkpoint(state);
    } else {
      const payload = await client.post("/reserved_ips", { region: state.plan.region }, [201, 202]);
      state.resourceIds.reservedIp = payload.reserved_ip.ip;
      await checkpoint(state);
    }
  }
  return receipt(state, "network", "G085_NETWORK_CREATED", {
    firewallId: state.resourceIds.firewallId,
    reservedIp: state.resourceIds.reservedIp,
    publicPorts: [22, 80, 443],
    privatePorts: "Relay Cell, SQLite, Docker and runtime ports are not public",
  });
}

export async function createStorageG085(client, state, { checkpoint = noCheckpoint } = {}) {
  if (state.resourceIds.volumeId) return receipt(state, "storage", "G085_STORAGE_REUSED", { volumeId: state.resourceIds.volumeId });
  const existing = await oneNamedResource(
    client,
    `/volumes?region=${encodeURIComponent(state.plan.region)}&per_page=200`,
    "volumes",
    state.plan.resources.volume,
  );
  if (existing) {
    state.resourceIds.volumeId = existing.id;
    await checkpoint(state);
    return receipt(state, "storage", "G085_STORAGE_RECONCILED", {
      volumeId: existing.id,
      sizeGiB: existing.size_gigabytes,
    });
  }
  const payload = await client.post("/volumes", {
    region: state.plan.region,
    name: state.plan.resources.volume,
    description: `Disposable G-085 recovery volume for ${state.runId}`,
    size_gigabytes: state.plan.volumeGiB,
    filesystem_type: "ext4",
  }, [201]);
  state.resourceIds.volumeId = payload.volume.id;
  await checkpoint(state);
  return receipt(state, "storage", "G085_STORAGE_CREATED", {
    volumeId: payload.volume.id,
    sizeGiB: payload.volume.size_gigabytes,
  });
}

export function g085CloudInit(publicKey) {
  const normalizedPublicKey = cloudInitPublicKey(publicKey);
  return `#cloud-config
users:
  - name: relay
    gecos: Relay Host operator
    groups: [adm, sudo]
    sudo: ["ALL=(ALL) NOPASSWD:ALL"]
    shell: /bin/bash
    ssh_authorized_keys:
      - ${normalizedPublicKey}
ssh_pwauth: false
disable_root: true
package_update: true
packages:
  - ca-certificates
  - curl
  - docker.io
  - jq
runcmd:
  - [systemctl, enable, --now, docker]
  - [usermod, -aG, docker, relay]
  - [mkdir, -p, /srv/relay-host, /srv/relay-cells, /srv/relay-recovery]
  - [chown, -R, relay:relay, /srv/relay-host, /srv/relay-cells, /srv/relay-recovery]
  - [sh, -c, "printf 'ready\\n' > /var/lib/relay-g085-bootstrap"]
`;
}

export async function createComputeG085(client, state, publicKey, { checkpoint = noCheckpoint } = {}) {
  assertPublicKey(publicKey);
  if (!state.resourceIds.sshKeyId || !state.resourceIds.firewallId || !state.resourceIds.reservedIp || !state.resourceIds.volumeId) {
    fail("G085_DEPENDENCY_MISSING", "Access, network and storage stages must complete before compute.");
  }
  if (!state.resourceIds.dropletId) {
    const existing = await oneNamedResource(client, "/droplets?per_page=200", "droplets", state.plan.resources.droplet);
    if (existing) {
      state.resourceIds.dropletId = existing.id;
      await checkpoint(state);
    } else {
      const payload = await client.post("/droplets", {
      name: state.plan.resources.droplet,
      region: state.plan.region,
      size: state.plan.size,
      image: state.plan.image,
      ssh_keys: [state.resourceIds.sshKeyId],
      backups: false,
      ipv6: false,
      monitoring: true,
      tags: [],
      user_data: g085CloudInit(publicKey),
      }, [202]);
      state.resourceIds.dropletId = payload.droplet.id;
      await checkpoint(state);
      for (const action of payload.links?.actions ?? []) await client.waitForAction(action.id);
    }
  }
  const dropletId = state.resourceIds.dropletId;
  const droplet = (await client.get(`/droplets/${dropletId}`)).droplet;
  if (
    droplet.name !== state.plan.resources.droplet ||
    droplet.region?.slug !== state.plan.region ||
    droplet.size_slug !== state.plan.size
  ) {
    fail("G085_RESOURCE_COLLISION", "Tracked Droplet no longer matches the approved G-085 plan.", {
      dropletId,
      name: droplet.name,
      region: droplet.region?.slug,
      size: droplet.size_slug,
    });
  }
  const firewall = (await client.get(`/firewalls/${state.resourceIds.firewallId}`)).firewall;
  if (firewall.name !== state.plan.resources.firewall) {
    fail("G085_RESOURCE_COLLISION", "Tracked firewall no longer matches the approved G-085 plan.");
  }
  await client.put(`/firewalls/${state.resourceIds.firewallId}`, {
    name: state.plan.resources.firewall,
    inbound_rules: [
      { protocol: "tcp", ports: "22", sources: { addresses: [state.plan.sshSourceCidr] } },
      { protocol: "tcp", ports: "80", sources: { addresses: ["0.0.0.0/0", "::/0"] } },
      { protocol: "tcp", ports: "443", sources: { addresses: ["0.0.0.0/0", "::/0"] } },
    ],
    outbound_rules: [
      { protocol: "tcp", ports: "all", destinations: { addresses: ["0.0.0.0/0", "::/0"] } },
      { protocol: "udp", ports: "all", destinations: { addresses: ["0.0.0.0/0", "::/0"] } },
      { protocol: "icmp", destinations: { addresses: ["0.0.0.0/0", "::/0"] } },
    ],
    droplet_ids: [dropletId],
    tags: [],
  });
  const reservedIp = (await client.get(`/reserved_ips/${state.resourceIds.reservedIp}`)).reserved_ip;
  if (reservedIp.droplet?.id !== dropletId) {
    if (reservedIp.droplet) {
      fail("G085_RESOURCE_COLLISION", "Reserved IP is assigned to a different Droplet.", {
        reservedIp: state.resourceIds.reservedIp,
        assignedDropletId: reservedIp.droplet.id,
      });
    }
    const ipAction = await client.post(`/reserved_ips/${state.resourceIds.reservedIp}/actions`, { type: "assign", droplet_id: dropletId }, [201]);
    await client.waitForAction(ipAction.action.id);
  }
  const volume = (await client.get(`/volumes/${state.resourceIds.volumeId}`)).volume;
  if (volume.name !== state.plan.resources.volume || volume.region?.slug !== state.plan.region) {
    fail("G085_RESOURCE_COLLISION", "Tracked recovery volume no longer matches the approved G-085 plan.");
  }
  if (!volume.droplet_ids?.includes(dropletId)) {
    if ((volume.droplet_ids?.length ?? 0) > 0) {
      fail("G085_RESOURCE_COLLISION", "Recovery volume is attached to a different Droplet.", {
        volumeId: state.resourceIds.volumeId,
        attachedDropletIds: volume.droplet_ids,
      });
    }
    const volumeAction = await client.post(`/volumes/${state.resourceIds.volumeId}/actions`, {
      type: "attach",
      droplet_id: dropletId,
      region: state.plan.region,
    }, [202]);
    await client.waitForAction(volumeAction.action.id);
  }
  const hostname = `${state.plan.prefix}.${state.resourceIds.reservedIp.replaceAll(".", "-")}.sslip.io`;
  return receipt(state, "compute", "G085_COMPUTE_CREATED", {
    dropletId,
    reservedIp: state.resourceIds.reservedIp,
    hostname,
  });
}

async function ignoreGone(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DigitalOceanG085Error && error.code === "G085_PROVIDER_NOT_FOUND") return null;
    throw error;
  }
}

export async function destroyG085(client, state, { checkpoint = noCheckpoint } = {}) {
  const ids = state.resourceIds;
  const removed = [];
  if (!state.cleanupIds) {
    state.cleanupIds = structuredClone(ids);
    await checkpoint(state);
  }
  const [dropletPayload, volumePayload, ipPayload, firewallPayload, keyPayload] = await Promise.all([
    ids.dropletId ? ignoreGone(() => client.get(`/droplets/${ids.dropletId}`)) : null,
    ids.volumeId ? ignoreGone(() => client.get(`/volumes/${ids.volumeId}`)) : null,
    ids.reservedIp ? ignoreGone(() => client.get(`/reserved_ips/${ids.reservedIp}`)) : null,
    ids.firewallId ? ignoreGone(() => client.get(`/firewalls/${ids.firewallId}`)) : null,
    ids.sshKeyId ? ignoreGone(() => client.get(`/account/keys/${ids.sshKeyId}`)) : null,
  ]);
  if (dropletPayload && dropletPayload.droplet.name !== state.plan.resources.droplet) {
    fail("G085_RESOURCE_COLLISION", "Refusing to delete a Droplet outside the G-085 plan.");
  }
  if (volumePayload && volumePayload.volume.name !== state.plan.resources.volume) {
    fail("G085_RESOURCE_COLLISION", "Refusing to delete a volume outside the G-085 plan.");
  }
  if (firewallPayload && firewallPayload.firewall.name !== state.plan.resources.firewall) {
    fail("G085_RESOURCE_COLLISION", "Refusing to delete a firewall outside the G-085 plan.");
  }
  if (keyPayload && keyPayload.ssh_key.name !== state.plan.resources.sshKey) {
    fail("G085_RESOURCE_COLLISION", "Refusing to delete an SSH key outside the G-085 plan.");
  }
  if (ipPayload?.reserved_ip?.droplet && ipPayload.reserved_ip.droplet.id !== ids.dropletId) {
    fail("G085_RESOURCE_COLLISION", "Refusing to unassign a reserved IP from another Droplet.");
  }
  if (ids.dropletId && ids.volumeId) {
    if (volumePayload?.volume?.droplet_ids?.includes(ids.dropletId)) {
      const detached = await client.post(`/volumes/${ids.volumeId}/actions`, {
        type: "detach",
        droplet_id: ids.dropletId,
        region: state.plan.region,
      }, [202]);
      await client.waitForAction(detached.action.id);
    }
  }
  if (ids.dropletId && ids.reservedIp) {
    if (ipPayload?.reserved_ip?.droplet?.id === ids.dropletId) {
      const unassigned = await client.post(`/reserved_ips/${ids.reservedIp}/actions`, { type: "unassign" }, [201]);
      await client.waitForAction(unassigned.action.id);
    }
  }
  if (ids.dropletId) {
    await ignoreGone(() => client.delete(`/droplets/${ids.dropletId}`));
    removed.push({ kind: "droplet", id: ids.dropletId });
    ids.dropletId = null;
    await checkpoint(state);
  }
  if (ids.volumeId) {
    await ignoreGone(() => client.delete(`/volumes/${ids.volumeId}`));
    removed.push({ kind: "volume", id: ids.volumeId });
    ids.volumeId = null;
    await checkpoint(state);
  }
  if (ids.reservedIp) {
    await ignoreGone(() => client.delete(`/reserved_ips/${ids.reservedIp}`));
    removed.push({ kind: "reservedIp", id: ids.reservedIp });
    ids.reservedIp = null;
    await checkpoint(state);
  }
  if (ids.firewallId) {
    await ignoreGone(() => client.delete(`/firewalls/${ids.firewallId}`));
    removed.push({ kind: "firewall", id: ids.firewallId });
    ids.firewallId = null;
    await checkpoint(state);
  }
  if (ids.sshKeyId) {
    await ignoreGone(() => client.delete(`/account/keys/${ids.sshKeyId}`));
    removed.push({ kind: "sshKey", id: ids.sshKeyId });
    ids.sshKeyId = null;
    await checkpoint(state);
  }
  const inventory = await inventoryG085(client, state);
  if (Object.values(inventory).some((items) => items.length > 0)) {
    fail("G085_CLEANUP_INCOMPLETE", "DigitalOcean still reports G-085 resources after teardown.", inventory);
  }
  state.cleanupIds = null;
  await checkpoint(state);
  return receipt(state, "cleanup", "G085_CLEANUP_COMPLETE", { removed, inventory });
}
