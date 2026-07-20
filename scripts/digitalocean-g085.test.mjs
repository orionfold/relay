import assert from "node:assert/strict";
import test from "node:test";
import {
  createAccessG085,
  createComputeG085,
  createG085Plan,
  createG085State,
  createNetworkG085,
  createStorageG085,
  destroyG085,
  DigitalOceanG085Client,
  DigitalOceanG085Error,
  g085CloudInit,
  inventoryG085,
  preflightG085,
  redactG085,
  resourcePrefix,
  validateG085State,
} from "./lib/digitalocean-g085.mjs";

const PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEexampleonlynotasecret relay-g085";
const CELL_IMAGE = `ghcr.io/orionfold/relay-cell@sha256:${"a".repeat(64)}`;

function plan(overrides = {}) {
  return createG085Plan({
    runId: "test-run",
    relayVersion: "0.44.3",
    cellImage: CELL_IMAGE,
    sshSourceCidr: "203.0.113.9/32",
    ...overrides,
  });
}

function json(payload, status = 200, headers = {}) {
  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function routeClient(routes, calls = []) {
  return new DigitalOceanG085Client({
    token: "provider-secret",
    retries: 0,
    sleep: async () => {},
    fetchImpl: async (url, options) => {
      const path = new URL(url).pathname + new URL(url).search;
      calls.push({ path, method: options.method, body: options.body ? JSON.parse(options.body) : undefined, authorization: options.headers.Authorization });
      const key = `${options.method} ${path}`;
      const handler = routes[key] ?? routes[`${options.method} ${new URL(url).pathname}`];
      if (!handler) throw new Error(`Unexpected request: ${key}`);
      return typeof handler === "function" ? handler(calls.at(-1)) : handler;
    },
  });
}

test("plan is bounded and content-free", () => {
  const value = plan();
  assert.equal(value.prefix, "relay-g085-test-run");
  assert.equal(value.region, "sfo3");
  assert.equal(value.size, "s-2vcpu-4gb");
  assert.equal(value.volumeGiB, 10);
  assert.equal(value.approvedRunCeilingUsd, 10);
  assert.equal(JSON.stringify(value).includes("provider-secret"), false);
});

test("plan rejects unsafe identifiers, broad SSH sources, mutable images and oversized volume", () => {
  assert.throws(() => resourcePrefix("../unsafe"), { code: "G085_RUN_ID_INVALID" });
  assert.throws(() => plan({ sshSourceCidr: "0.0.0.0/0" }), { code: "G085_SSH_CIDR_INVALID" });
  assert.throws(() => plan({ cellImage: "ghcr.io/orionfold/relay-cell:latest" }), { code: "G085_CELL_IMAGE_INVALID" });
  assert.throws(() => plan({ volumeGiB: 100 }), { code: "G085_VOLUME_SIZE_INVALID" });
  assert.throws(() => plan({ size: "s-8vcpu-16gb" }), { code: "G085_PROFILE_UNAPPROVED" });
});

test("redaction removes nested credentials without hiding provider resource IDs", () => {
  const value = redactG085({
    token: "one",
    nested: { authorization: "two", privateKey: "three", dropletId: 42 },
  });
  assert.deepEqual(value, {
    token: "[REDACTED]",
    nested: { authorization: "[REDACTED]", privateKey: "[REDACTED]", dropletId: 42 },
  });
});

test("state validation rejects a mutated profile and unsafe provider IDs", () => {
  const safe = createG085State(plan());
  assert.equal(validateG085State(safe), safe);
  const expensive = structuredClone(safe);
  expensive.plan.size = "s-8vcpu-16gb";
  assert.throws(() => validateG085State(expensive), { code: "G085_PROFILE_UNAPPROVED" });
  const unsafe = structuredClone(safe);
  unsafe.resourceIds.volumeId = "../droplets/42";
  assert.throws(() => validateG085State(unsafe), { code: "G085_STATE_INVALID" });
});

test("client never places the token in the URL or body", async () => {
  const calls = [];
  const client = routeClient({ "GET /v2/account": json({ account: { status: "active" } }) }, calls);
  await client.get("/account");
  assert.equal(calls[0].path.includes("provider-secret"), false);
  assert.equal(JSON.stringify(calls[0].body ?? null).includes("provider-secret"), false);
  assert.equal(calls[0].authorization, "Bearer provider-secret");
});

test("client names authorization and validation failures", async () => {
  const unauthorized = routeClient({ "GET /v2/account": json({ message: "forbidden" }, 403) });
  await assert.rejects(() => unauthorized.get("/account"), { code: "G085_PROVIDER_AUTH_FAILED" });
  const invalid = routeClient({ "POST /v2/droplets": json({ message: "bad size" }, 422) });
  await assert.rejects(() => invalid.post("/droplets", {}), { code: "G085_PROVIDER_REQUEST_INVALID" });
});

test("client retries a transient provider response with bounded backoff", async () => {
  let attempts = 0;
  const sleeps = [];
  const client = new DigitalOceanG085Client({
    token: "provider-secret",
    retries: 1,
    sleep: async (ms) => sleeps.push(ms),
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1 ? json({ message: "busy" }, 503) : json({ account: { status: "active" } });
    },
  });
  assert.equal((await client.get("/account")).account.status, "active");
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [250]);
});

test("client never retries an ambiguous POST mutation", async () => {
  let attempts = 0;
  const client = new DigitalOceanG085Client({
    token: "provider-secret",
    retries: 2,
    sleep: async () => {},
    fetchImpl: async () => {
      attempts += 1;
      return json({ message: "response lost after possible mutation" }, 503);
    },
  });
  await assert.rejects(() => client.post("/reserved_ips", { region: "sfo3" }), { code: "G085_PROVIDER_RETRYABLE" });
  assert.equal(attempts, 1);
});

test("pagination refuses a next link outside the DigitalOcean API origin", async () => {
  const client = routeClient({
    "GET /v2/droplets?per_page=200": json({ droplets: [], links: { pages: { next: "https://example.com/steal" } } }),
  });
  await assert.rejects(() => client.list("/droplets?per_page=200", "droplets"), { code: "G085_PROVIDER_PAGINATION_INVALID" });
});

test("preflight proves account, region, size and an empty run inventory", async () => {
  const state = createG085State(plan(), new Date("2026-07-19T00:00:00Z"));
  const routes = {
    "GET /v2/account": json({ account: { status: "active", droplet_limit: 3, floating_ip_limit: 3, volume_limit: 10 } }),
    "GET /v2/regions?per_page=200": json({ regions: [{ slug: "sfo3", available: true }] }),
    "GET /v2/sizes?per_page=200": json({ sizes: [{ slug: "s-2vcpu-4gb", available: true, regions: ["sfo3"], price_monthly: 24, price_hourly: 0.03571 }] }),
    "GET /v2/droplets?per_page=200": json({ droplets: [] }),
    "GET /v2/firewalls?per_page=200": json({ firewalls: [] }),
    "GET /v2/volumes?region=sfo3&per_page=200": json({ volumes: [] }),
    "GET /v2/account/keys?per_page=200": json({ ssh_keys: [] }),
    "GET /v2/reserved_ips?per_page=200": json({ reserved_ips: [] }),
  };
  await preflightG085(routeClient(routes), state);
  assert.equal(state.receipts.at(-1).reasonCode, "G085_PREFLIGHT_PASSED");
  assert.equal(state.receipts.at(-1).details.size.priceHourly, 0.03571);
});

test("preflight refuses a run-label collision", async () => {
  const state = createG085State(plan());
  const routes = {
    "GET /v2/account": json({ account: { status: "active" } }),
    "GET /v2/regions?per_page=200": json({ regions: [{ slug: "sfo3", available: true }] }),
    "GET /v2/sizes?per_page=200": json({ sizes: [{ slug: "s-2vcpu-4gb", available: true, regions: ["sfo3"] }] }),
    "GET /v2/droplets?per_page=200": json({ droplets: [{ id: 1, name: "relay-g085-test-run-old" }] }),
    "GET /v2/firewalls?per_page=200": json({ firewalls: [] }),
    "GET /v2/volumes?region=sfo3&per_page=200": json({ volumes: [] }),
    "GET /v2/account/keys?per_page=200": json({ ssh_keys: [] }),
    "GET /v2/reserved_ips?per_page=200": json({ reserved_ips: [] }),
  };
  await assert.rejects(() => preflightG085(routeClient(routes), state), { code: "G085_RESOURCE_COLLISION" });
});

test("preflight fails closed when provider pricing exceeds the approved profile", async () => {
  const state = createG085State(plan());
  const routes = {
    "GET /v2/account": json({ account: { status: "active" } }),
    "GET /v2/regions?per_page=200": json({ regions: [{ slug: "sfo3", available: true }] }),
    "GET /v2/sizes?per_page=200": json({ sizes: [{ slug: "s-2vcpu-4gb", available: true, regions: ["sfo3"], price_monthly: 25, price_hourly: 0.04 }] }),
    "GET /v2/droplets?per_page=200": json({ droplets: [] }),
    "GET /v2/firewalls?per_page=200": json({ firewalls: [] }),
    "GET /v2/volumes?region=sfo3&per_page=200": json({ volumes: [] }),
    "GET /v2/account/keys?per_page=200": json({ ssh_keys: [] }),
    "GET /v2/reserved_ips?per_page=200": json({ reserved_ips: [] }),
  };
  await assert.rejects(() => preflightG085(routeClient(routes), state), { code: "G085_COST_CEILING_EXCEEDED" });
});

test("access, network and storage create only approved resources and are resumable", async () => {
  const calls = [];
  const state = createG085State(plan());
  const client = routeClient({
    "GET /v2/account/keys?per_page=200": json({ ssh_keys: [] }),
    "POST /v2/account/keys": json({ ssh_key: { id: 11, fingerprint: "fingerprint" } }, 201),
    "GET /v2/firewalls?per_page=200": json({ firewalls: [] }),
    "POST /v2/firewalls": json({ firewall: { id: "fw-1" } }, 202),
    "GET /v2/reserved_ips?per_page=200": json({ reserved_ips: [] }),
    "POST /v2/reserved_ips": json({ reserved_ip: { ip: "198.51.100.7" } }, 202),
    "GET /v2/volumes?region=sfo3&per_page=200": json({ volumes: [] }),
    "POST /v2/volumes": json({ volume: { id: "vol-1", size_gigabytes: 10 } }, 201),
  }, calls);
  await createAccessG085(client, state, PUBLIC_KEY);
  await createAccessG085(client, state, PUBLIC_KEY);
  await createNetworkG085(client, state);
  await createStorageG085(client, state);
  await createStorageG085(client, state);
  assert.deepEqual(state.resourceIds, {
    sshKeyId: 11,
    firewallId: "fw-1",
    reservedIp: "198.51.100.7",
    volumeId: "vol-1",
    dropletId: null,
  });
  assert.equal(calls.filter((call) => call.path === "/v2/account/keys").length, 1);
  assert.equal(calls.filter((call) => call.path === "/v2/volumes").length, 1);
  const firewall = calls.find((call) => call.path === "/v2/firewalls").body;
  assert.deepEqual(firewall.inbound_rules.map((rule) => rule.ports), ["22", "80", "443"]);
  assert.deepEqual(firewall.inbound_rules[0].sources.addresses, ["203.0.113.9/32"]);
});

test("network checkpoints the firewall ID before a later provider failure", async () => {
  const state = createG085State(plan());
  const checkpoints = [];
  const client = routeClient({
    "GET /v2/firewalls?per_page=200": json({ firewalls: [] }),
    "POST /v2/firewalls": json({ firewall: { id: "fw-partial" } }, 202),
    "GET /v2/reserved_ips?per_page=200": json({ reserved_ips: [] }),
    "POST /v2/reserved_ips": json({ message: "temporarily unavailable" }, 503),
  });
  await assert.rejects(
    () => createNetworkG085(client, state, { checkpoint: async (current) => checkpoints.push(structuredClone(current.resourceIds)) }),
    { code: "G085_PROVIDER_RETRYABLE" },
  );
  assert.equal(checkpoints[0].firewallId, "fw-partial");
  assert.equal(state.resourceIds.reservedIp, null);
});

test("network reconciles one reserved IP created after an ambiguous response", async () => {
  const state = createG085State(plan());
  state.resourceIds.firewallId = "fw-existing";
  state.reservedIpBaseline = ["198.51.100.1"];
  const calls = [];
  const client = routeClient({
    "GET /v2/reserved_ips?per_page=200": json({
      reserved_ips: [
        { ip: "198.51.100.1", droplet: null, region: { slug: "sfo3" } },
        { ip: "198.51.100.7", droplet: null, region: { slug: "sfo3" } },
      ],
    }),
  }, calls);
  await createNetworkG085(client, state);
  assert.equal(state.resourceIds.reservedIp, "198.51.100.7");
  assert.equal(calls.some((call) => call.method === "POST"), false);
});

test("compute requires prior stages and cloud-init creates a non-root operator", async () => {
  const state = createG085State(plan());
  const client = routeClient({});
  await assert.rejects(() => createComputeG085(client, state, PUBLIC_KEY), { code: "G085_DEPENDENCY_MISSING" });
  const cloudInit = g085CloudInit(PUBLIC_KEY);
  assert.match(cloudInit, /name: relay/);
  assert.match(cloudInit, /disable_root: true/);
  assert.match(cloudInit, /ssh_pwauth: false/);
  assert.equal(cloudInit.includes("DIGITALOCEAN_TOKEN"), false);
});

test("compute attaches firewall, reserved IP and volume after Droplet creation", async () => {
  const calls = [];
  const state = createG085State(plan());
  Object.assign(state.resourceIds, { sshKeyId: 11, firewallId: "fw-1", reservedIp: "198.51.100.7", volumeId: "vol-1" });
  const routes = {
    "GET /v2/droplets?per_page=200": json({ droplets: [] }),
    "POST /v2/droplets": json({ droplet: { id: 22 }, links: { actions: [{ id: 101 }] } }, 202),
    "GET /v2/actions/101": json({ action: { id: 101, status: "completed" } }),
    "GET /v2/droplets/22": json({ droplet: { id: 22, name: "relay-g085-test-run-host", region: { slug: "sfo3" }, size_slug: "s-2vcpu-4gb" } }),
    "GET /v2/firewalls/fw-1": json({ firewall: { id: "fw-1", name: "relay-g085-test-run-firewall" } }),
    "PUT /v2/firewalls/fw-1": json({ firewall: { id: "fw-1" } }),
    "GET /v2/reserved_ips/198.51.100.7": json({ reserved_ip: { ip: "198.51.100.7", droplet: null } }),
    "POST /v2/reserved_ips/198.51.100.7/actions": json({ action: { id: 102 } }, 201),
    "GET /v2/actions/102": json({ action: { id: 102, status: "completed" } }),
    "GET /v2/volumes/vol-1": json({ volume: { id: "vol-1", name: "relay-g085-test-run-recovery", region: { slug: "sfo3" }, droplet_ids: [] } }),
    "POST /v2/volumes/vol-1/actions": json({ action: { id: 103 } }, 202),
    "GET /v2/actions/103": json({ action: { id: 103, status: "completed" } }),
  };
  await createComputeG085(routeClient(routes, calls), state, PUBLIC_KEY);
  assert.equal(state.resourceIds.dropletId, 22);
  assert.equal(state.receipts.at(-1).details.hostname, "relay-g085-test-run.198-51-100-7.sslip.io");
  assert.deepEqual(calls.find((call) => call.path === "/v2/firewalls/fw-1" && call.method === "PUT").body.droplet_ids, [22]);
});

test("inventory includes only this run prefix and its tracked reserved IP", async () => {
  const state = createG085State(plan());
  state.resourceIds.reservedIp = "198.51.100.7";
  const routes = {
    "GET /v2/droplets?per_page=200": json({ droplets: [{ id: 1, name: "relay-g085-test-run-host" }, { id: 2, name: "customer" }] }),
    "GET /v2/firewalls?per_page=200": json({ firewalls: [] }),
    "GET /v2/volumes?region=sfo3&per_page=200": json({ volumes: [] }),
    "GET /v2/account/keys?per_page=200": json({ ssh_keys: [] }),
    "GET /v2/reserved_ips?per_page=200": json({ reserved_ips: [{ ip: "198.51.100.7" }, { ip: "198.51.100.8" }] }),
  };
  const inventory = await inventoryG085(routeClient(routes), state);
  assert.equal(inventory.droplets.length, 1);
  assert.deepEqual(inventory.reservedIps.map((item) => item.ip), ["198.51.100.7"]);
});

test("destroy removes known resources in dependency order and proves zero inventory", async () => {
  const calls = [];
  const state = createG085State(plan());
  Object.assign(state.resourceIds, {
    sshKeyId: 11,
    firewallId: "fw-1",
    reservedIp: "198.51.100.7",
    volumeId: "vol-1",
    dropletId: 22,
  });
  const routes = {
    "GET /v2/droplets/22": json({ droplet: { id: 22, name: "relay-g085-test-run-host" } }),
    "GET /v2/volumes/vol-1": json({ volume: { id: "vol-1", name: "relay-g085-test-run-recovery", droplet_ids: [22] } }),
    "POST /v2/volumes/vol-1/actions": json({ action: { id: 201 } }, 202),
    "GET /v2/actions/201": json({ action: { id: 201, status: "completed" } }),
    "GET /v2/reserved_ips/198.51.100.7": json({ reserved_ip: { ip: "198.51.100.7", droplet: { id: 22 } } }),
    "GET /v2/firewalls/fw-1": json({ firewall: { id: "fw-1", name: "relay-g085-test-run-firewall" } }),
    "GET /v2/account/keys/11": json({ ssh_key: { id: 11, name: "relay-g085-test-run-key" } }),
    "POST /v2/reserved_ips/198.51.100.7/actions": json({ action: { id: 202 } }, 201),
    "GET /v2/actions/202": json({ action: { id: 202, status: "completed" } }),
    "DELETE /v2/droplets/22": json(null, 204),
    "DELETE /v2/volumes/vol-1": json(null, 204),
    "DELETE /v2/reserved_ips/198.51.100.7": json(null, 204),
    "DELETE /v2/firewalls/fw-1": json(null, 204),
    "DELETE /v2/account/keys/11": json(null, 204),
    "GET /v2/droplets?per_page=200": json({ droplets: [] }),
    "GET /v2/firewalls?per_page=200": json({ firewalls: [] }),
    "GET /v2/volumes?region=sfo3&per_page=200": json({ volumes: [] }),
    "GET /v2/account/keys?per_page=200": json({ ssh_keys: [] }),
    "GET /v2/reserved_ips?per_page=200": json({ reserved_ips: [] }),
  };
  await destroyG085(routeClient(routes, calls), state);
  assert.deepEqual(calls.filter((call) => call.method === "DELETE").map((call) => call.path), [
    "/v2/droplets/22",
    "/v2/volumes/vol-1",
    "/v2/reserved_ips/198.51.100.7",
    "/v2/firewalls/fw-1",
    "/v2/account/keys/11",
  ]);
  assert.equal(calls.find((call) => call.path === "/v2/volumes/vol-1/actions").body.type, "detach");
  assert.equal(calls.find((call) => call.path === "/v2/reserved_ips/198.51.100.7/actions").body.type, "unassign");
  assert.equal(state.receipts.at(-1).reasonCode, "G085_CLEANUP_COMPLETE");
  assert.deepEqual(Object.values(state.resourceIds), [null, null, null, null, null]);
});

test("destroy tolerates resources already gone but exposes remaining inventory", async () => {
  const state = createG085State(plan());
  state.resourceIds.dropletId = 22;
  const routes = {
    "GET /v2/volumes/vol-1": json({ message: "not found" }, 404),
    "GET /v2/reserved_ips/198.51.100.7": json({ message: "not found" }, 404),
    "GET /v2/droplets/22": json({ message: "not found" }, 404),
    "DELETE /v2/droplets/22": json({ message: "not found" }, 404),
    "GET /v2/droplets?per_page=200": json({ droplets: [{ id: 99, name: "relay-g085-test-run-orphan" }] }),
    "GET /v2/firewalls?per_page=200": json({ firewalls: [] }),
    "GET /v2/volumes?region=sfo3&per_page=200": json({ volumes: [] }),
    "GET /v2/account/keys?per_page=200": json({ ssh_keys: [] }),
    "GET /v2/reserved_ips?per_page=200": json({ reserved_ips: [] }),
  };
  await assert.rejects(() => destroyG085(routeClient(routes), state), (error) => {
    assert.ok(error instanceof DigitalOceanG085Error);
    assert.equal(error.code, "G085_CLEANUP_INCOMPLETE");
    assert.equal(error.details.droplets[0].id, 99);
    return true;
  });
});
