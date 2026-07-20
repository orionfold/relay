#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildG085BootstrapScript,
  currentCellManifest,
  DigitalOceanG085LiveError,
  G085_LIVE_PROFILE,
  g085LiveReleaseVersions,
  g085Hostname,
  loadG085ProviderState,
  redactLiveReceipt,
  rollbackCellManifest,
} from "./lib/digitalocean-g085-live.mjs";

const USAGE = `Usage: node scripts/digitalocean-g085-live.mjs <command> --state <provider-state> --private-key <file> --evidence-dir <dir>

Commands:
  bootstrap     Install released Relay, verified tools, mounted recovery storage and TLS ingress; create first admin
  conformance   Run Host/Cell, Ollama task, recovery, replacement and rollback proof
  cleanup       Remove proof-owned runtime resources and secrets before provider teardown

The provider state must already contain the bounded Droplet, reserved IP and volume IDs.`;

function fail(code, message, details, options) {
  throw new DigitalOceanG085LiveError(code, message, details, options);
}

function parse(argv) {
  const [command, ...rest] = argv;
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    const value = rest[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--")) {
      fail("G085_LIVE_ARGUMENT_INVALID", `Invalid argument near ${name ?? "end"}.`);
    }
    if (values.has(name.slice(2))) fail("G085_LIVE_ARGUMENT_INVALID", `Duplicate ${name} option.`);
    values.set(name.slice(2), value);
  }
  return { command, values };
}

function required(values, name) {
  const value = values.get(name);
  if (!value) fail("G085_LIVE_ARGUMENT_REQUIRED", `Missing --${name}.`);
  return path.resolve(value);
}

function commandResult(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    input: options.input,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    maxBuffer: 40 * 1024 * 1024,
    timeout: options.timeout ?? 300_000,
  });
  if (result.status !== 0) {
    fail(options.code ?? "G085_LIVE_COMMAND_FAILED", `${command} failed.`, {
      command,
      exitCode: result.status,
      stdout: String(result.stdout ?? "").slice(-4000),
      stderr: String(result.stderr ?? "").slice(-4000),
    });
  }
  return String(result.stdout ?? "").trim();
}

function sshArgs(keyPath, host, knownHostsPath) {
  return [
    "-i", keyPath,
    "-o", "BatchMode=yes",
    "-o", "IdentitiesOnly=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", `UserKnownHostsFile=${knownHostsPath}`,
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=15",
    `relay@${host}`,
  ];
}

function sshRun(context, script, options = {}) {
  return commandResult("ssh", [...sshArgs(context.keyPath, context.ip, context.knownHostsPath), "bash", "-s"], {
    input: script,
    timeout: options.timeout ?? 600_000,
    code: options.code ?? "G085_LIVE_SSH_FAILED",
  });
}

function waitForSsh(context) {
  const deadline = Date.now() + 360_000;
  let last = "SSH not attempted";
  while (Date.now() < deadline) {
    const result = spawnSync("ssh", [...sshArgs(context.keyPath, context.ip, context.knownHostsPath), "true"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20_000,
    });
    if (result.status === 0) return;
    last = String(result.stderr ?? "").trim().slice(-500);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5_000);
  }
  fail("G085_LIVE_SSH_TIMEOUT", "The G-085 Droplet never accepted the disposable SSH key.", { last });
}

function jsonLine(stdout) {
  const line = stdout.split("\n").reverse().find((candidate) => candidate.trim().startsWith("{"));
  if (!line) fail("G085_LIVE_RECEIPT_MISSING", "The remote stage did not return its JSON receipt.");
  try {
    return JSON.parse(line);
  } catch (cause) {
    fail("G085_LIVE_RECEIPT_INVALID", "The remote stage returned invalid JSON.", { line }, { cause });
  }
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value, mode = 0o600) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode });
  chmodSync(file, mode);
}

function receiptPath(context) {
  return path.join(context.evidenceDir, "live-receipt.json");
}

function secretPath(context) {
  return path.join(context.evidenceDir, ".live-secrets.json");
}

function appendReceipt(context, stage, details) {
  const file = receiptPath(context);
  const value = existsSync(file)
    ? readJson(file)
    : { schema: 1, goal: "G-085", runId: context.state.runId, startedAt: new Date().toISOString(), receipts: [] };
  value.receipts.push(redactLiveReceipt({ stage, at: new Date().toISOString(), details }));
  value.updatedAt = new Date().toISOString();
  writeJson(file, value);
}

function apiCookie(setCookie) {
  const value = setCookie?.split(";", 1)[0];
  if (!value?.includes("=")) fail("G085_LIVE_SESSION_MISSING", "Relay did not issue the authenticated browser session.");
  return value;
}

async function api(context, pathname, init = {}, expected = [200]) {
  const secrets = readJson(secretPath(context));
  const response = await fetch(`${context.origin}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Origin: context.origin,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      Cookie: secrets.cookie,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 1000) };
  }
  if (!expected.includes(response.status)) {
    fail("G085_LIVE_HTTP_FAILED", `${pathname} returned HTTP ${response.status}.`, body);
  }
  return body;
}

async function bootstrap(context) {
  waitForSsh(context);
  const remote = jsonLine(sshRun(context, buildG085BootstrapScript(context.state), {
    timeout: 1_200_000,
    code: "G085_BOOTSTRAP_FAILED",
  }));
  if (existsSync(secretPath(context))) {
    await api(context, "/api/settings/ollama");
    appendReceipt(context, "bootstrap", {
      reasonCode: "G085_BOOTSTRAP_RESUMED",
      ...remote,
      origin: context.origin,
      firstAdmin: true,
      existingSessionVerified: true,
    });
    console.log(JSON.stringify({ status: "pass", stage: "bootstrap", origin: context.origin, resumed: true }, null, 2));
    return;
  }
  const tokenOutput = sshRun(context, `set -euo pipefail
export RELAY_DATA_DIR=/srv/relay-host/data
relay auth bootstrap
`, { code: "G085_BOOTSTRAP_CREDENTIAL_FAILED" });
  const bootstrapToken = tokenOutput.split("\n").find((line) => /^[A-Za-z0-9_-]{32,256}$/.test(line.trim()))?.trim();
  if (!bootstrapToken) fail("G085_BOOTSTRAP_CREDENTIAL_MISSING", "Relay did not issue a first-admin credential.");
  const adminPassword = `${randomBytes(24).toString("base64url")}Aa1!`;
  const response = await fetch(`${context.origin}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: context.origin },
    body: JSON.stringify({ token: bootstrapToken, password: adminPassword, deviceName: "G-085 conformance" }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true) {
    fail("G085_BOOTSTRAP_ADMIN_FAILED", `Relay first-admin setup returned HTTP ${response.status}.`, body);
  }
  writeJson(secretPath(context), {
    adminPassword,
    cookie: apiCookie(response.headers.get("set-cookie")),
    recoveryCodes: body.recoveryCodes,
  });
  appendReceipt(context, "bootstrap", {
    reasonCode: "G085_BOOTSTRAP_PASSED",
    ...remote,
    origin: context.origin,
    firstAdmin: true,
    recoveryCodeCount: Array.isArray(body.recoveryCodes) ? body.recoveryCodes.length : 0,
  });
  console.log(JSON.stringify({ status: "pass", stage: "bootstrap", origin: context.origin }, null, 2));
}

function scp(context, files) {
  commandResult("scp", [
    "-i", context.keyPath,
    "-o", "BatchMode=yes",
    "-o", "IdentitiesOnly=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", `UserKnownHostsFile=${context.knownHostsPath}`,
    ...files,
    `relay@${context.ip}:/home/relay/g085-input/`,
  ], { timeout: 180_000, code: "G085_LIVE_SCP_FAILED" });
}

function prepareInputs(context) {
  const root = mkdtempSync(path.join(tmpdir(), "relay-g085-live-"));
  const fixture = readJson(path.resolve("src/lib/licensing/__tests__/fixtures/relay-host-license-v1.json"));
  const hostCase = fixture.cases.find((candidate) => candidate.name === "host-only");
  if (!hostCase) fail("G085_LIVE_LICENSE_FIXTURE_MISSING", "The signed Host conformance fixture is missing.");
  writeJson(path.join(root, "host.license.json"), { payload: hostCase.payload, signature: hostCase.signature });
  for (let index = 1; index <= 11; index += 1) {
    const id = `g085-cell-${String(index).padStart(2, "0")}`;
    writeJson(path.join(root, `${id}.json`), currentCellManifest(context.state, id, 4100 + index - 1));
  }
  writeJson(path.join(root, "g085-restored.json"), currentCellManifest(context.state, "g085-restored", 4111, "restore_new"));
  writeJson(path.join(root, "g085-rollback.json"), rollbackCellManifest(context.state, "g085-rollback", 4112));
  return root;
}

function hostCommand(action) {
  return `relay host ${action} --host-root /srv/relay-host/supervisor --license-dir /srv/relay-host/data/licenses --actor-ref g085-conformance`;
}

function conformanceScript(context) {
  return `#!/usr/bin/env bash
set -euo pipefail
export RELAY_DATA_DIR=/srv/relay-host/data
export RELAY_HOST_ROOT=/srv/relay-host/supervisor
relay license add /home/relay/g085-input/host.license.json >/dev/null
if [ ! -f /srv/relay-host/supervisor/host.db ]; then
  ${hostCommand("init")} --host-id g085-host --cpu-millis 2000 --memory-bytes 4294967296 --storage-bytes 53687091200 --reserve-percent 10 >/dev/null
fi
for n in $(seq -w 1 10); do
  ${hostCommand("create")} --manifest "/home/relay/g085-input/g085-cell-$n.json" --operation-id "g085-create-$n" >/dev/null
done
${hostCommand("start")} --cell-id g085-cell-01 --operation-id g085-start-01 >/dev/null
for _ in $(seq 1 120); do curl -fsS http://127.0.0.1:4100/api/health/ready >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:4100/api/health/ready >/dev/null
sudo docker exec --user 10001:10001 relay-cell-g085-cell-01 /nodejs/bin/node -e "const fs=require('fs');fs.mkdirSync('/var/lib/relay/uploads',{recursive:true});fs.writeFileSync('/var/lib/relay/uploads/g085-marker.txt','g085-survives-provider-recovery')"
${hostCommand("restart")} --cell-id g085-cell-01 --operation-id g085-restart-01 >/dev/null
for _ in $(seq 1 120); do curl -fsS http://127.0.0.1:4100/api/health/ready >/dev/null 2>&1 && break; sleep 1; done
marker="$(sudo docker exec --user 10001:10001 relay-cell-g085-cell-01 /nodejs/bin/node -e "process.stdout.write(require('fs').readFileSync('/var/lib/relay/uploads/g085-marker.txt','utf8'))")"
test "$marker" = "g085-survives-provider-recovery"

${hostCommand("start")} --cell-id g085-cell-02 --operation-id g085-start-02 >/dev/null
for _ in $(seq 1 120); do curl -fsS http://127.0.0.1:4101/api/health/ready >/dev/null 2>&1 && break; sleep 1; done
isolation="$(sudo docker exec --user 10001:10001 relay-cell-g085-cell-02 /nodejs/bin/node -e "process.stdout.write(require('fs').existsSync('/var/lib/relay/uploads/g085-marker.txt')?'leaked':'isolated')")"
test "$isolation" = "isolated"
${hostCommand("stop")} --cell-id g085-cell-02 --operation-id g085-stop-02 >/dev/null

if ${hostCommand("create")} --manifest /home/relay/g085-input/g085-cell-11.json --operation-id g085-refuse-11 > /tmp/g085-refuse-11 2>&1; then
  echo "Eleventh managed Cell was unexpectedly admitted" >&2; exit 1
fi
grep -Eq 'HOST_GRANT_MANAGED_CELL_LIMIT|HOST_CAPACITY_EXCEEDED' /tmp/g085-refuse-11
${hostCommand("retain")} --cell-id g085-cell-02 --operation-id g085-retain-02 >/dev/null
if ${hostCommand("create")} --manifest /home/relay/g085-input/g085-cell-11.json --operation-id g085-refuse-retained > /tmp/g085-refuse-retained 2>&1; then
  echo "Retained Cell stopped counting" >&2; exit 1
fi
grep -Eq 'HOST_GRANT_MANAGED_CELL_LIMIT|HOST_CAPACITY_EXCEEDED' /tmp/g085-refuse-retained
sudo chown -R relay:relay /srv/relay-host/supervisor/cells/g085-cell-02/data
${hostCommand("purge")} --cell-id g085-cell-02 --confirm g085-cell-02 --operation-id g085-purge-02 >/dev/null
${hostCommand("create")} --manifest /home/relay/g085-input/g085-cell-11.json --operation-id g085-create-11 >/dev/null

if sudo docker inspect relay-cell-g085-cell-01 | grep -Eq 'OF-RELAY-HOST|product:relay-host'; then
  echo "Host entitlement leaked into Cell runtime" >&2; exit 1
fi

sudo docker pull ${G085_LIVE_PROFILE.ollamaImage} >/dev/null
sudo docker rm -f relay-g085-ollama >/dev/null 2>&1 || true
sudo docker volume create relay-g085-ollama >/dev/null
sudo docker run -d --name relay-g085-ollama --restart unless-stopped \
  -p 127.0.0.1:11434:11434 -v relay-g085-ollama:/root/.ollama \
  ${G085_LIVE_PROFILE.ollamaImage} >/dev/null
for _ in $(seq 1 120); do curl -fsS http://127.0.0.1:11434/api/tags >/dev/null 2>&1 && break; sleep 1; done
sudo docker exec relay-g085-ollama ollama pull ${G085_LIVE_PROFILE.ollamaModel} >/dev/null
model_digest="$(curl -fsS http://127.0.0.1:11434/api/tags | jq -r '.models[] | select(.name | startswith("${G085_LIVE_PROFILE.ollamaModel}")) | .digest' | head -1)"
test -n "$model_digest"

printf '{"status":"pass","cellsAdmitted":10,"eleventhRefused":true,"retainedCounts":true,"crossCellIsolation":"%s","restartMarker":"%s","ollamaImage":"%s","ollamaModel":"%s","ollamaModelDigest":"%s"}\\n' \
  "$isolation" "$marker" ${JSON.stringify(G085_LIVE_PROFILE.ollamaImage)} ${JSON.stringify(G085_LIVE_PROFILE.ollamaModel)} "$model_digest"
`;
}

async function runTaskProof(context) {
  const configured = await api(context, "/api/settings/ollama", {
    method: "PUT",
    body: JSON.stringify({
      baseUrl: "http://localhost:11434",
      defaultModel: G085_LIVE_PROFILE.ollamaModel,
      allowInsecureRemote: false,
    }),
  });
  const tested = await api(context, "/api/settings/test", {
    method: "POST",
    body: JSON.stringify({ runtime: "ollama" }),
    timeoutMs: 120_000,
  });
  const created = await api(context, "/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: "G-085 private runtime proof",
      description: "Respond with a short confirmation that the DigitalOcean Relay Host reached its private Ollama runtime.",
      priority: 1,
      assignedAgent: "ollama",
      agentProfile: "general",
    }),
  }, [201]);
  await api(context, `/api/tasks/${created.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "queued" }),
  });
  const execution = await api(context, `/api/tasks/${created.id}/execute`, { method: "POST" }, [202]);
  const deadline = Date.now() + 300_000;
  let task;
  while (Date.now() < deadline) {
    task = await api(context, `/api/tasks/${created.id}`);
    if (["completed", "failed", "cancelled"].includes(task.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (task?.status !== "completed") {
    fail("G085_RUNTIME_FAILED", `The real Ollama task ended ${task?.status ?? "without a terminal state"}.`, task);
  }
  return {
    configured: configured.configured,
    baseUrl: configured.baseUrl,
    defaultModel: configured.defaultModel,
    connection: tested,
    task: { id: created.id, status: task.status, assignedAgent: task.assignedAgent },
    execution,
  };
}

function recoveryScript(context) {
  const versions = g085LiveReleaseVersions(context.state);
  return `#!/usr/bin/env bash
set -euo pipefail
export RELAY_DATA_DIR=/srv/relay-host/data
export RELAY_HOST_ROOT=/srv/relay-host/supervisor
${hostCommand("stop")} --cell-id g085-cell-01 --operation-id g085-stop-recovery >/dev/null
key=/home/relay/.relay-g085-recovery.key
rm -f "$key"
relay recovery key create --out "$key" >/dev/null
sudo chown -R relay:relay /srv/relay-host/supervisor/cells/g085-cell-01/data
created="$(RELAY_CELL_ID=g085-cell-01 relay recovery create --destination /mnt/relay-recovery/g085 --key-file "$key" --cell-id g085-cell-01 --data-dir /srv/relay-host/supervisor/cells/g085-cell-01/data)"
bundle="$(printf '%s\\n' "$created" | sed -n 's/^Published: //p' | tail -1)"
test -f "$bundle"
RELAY_CELL_ID=g085-cell-01 relay recovery verify --bundle "$bundle" --key-file "$key" --cell-id g085-cell-01 --data-dir /srv/relay-host/supervisor/cells/g085-cell-01/data >/dev/null
receipt="$(find /srv/relay-host/supervisor/cells/g085-cell-01/data/recovery/receipts -type f -name '*.json' -print0 \
  | xargs -0 -r jq -r 'select(.operation == "verify" and .status == "verified" and .bundleFile == "'"$(basename "$bundle")"'") | input_filename + "\t" + .startedAt' \
  | sort -t $'\t' -k2,2r | head -1 | cut -f1)"
test -f "$receipt"
digest="$(sha256sum "$bundle" | awk '{print $1}')"
${hostCommand("export-release")} --cell-id g085-cell-01 --operation-id g085-export-01 --checkpoint-ref "sha256:$digest" --checkpoint-receipt "$receipt" --checkpoint-bundle "$bundle" >/dev/null

${hostCommand("create")} --manifest /home/relay/g085-input/g085-restored.json --operation-id g085-create-restored >/dev/null
sudo rm -rf /srv/relay-host/supervisor/cells/g085-restored/data/*
sudo chown relay:relay /srv/relay-host/supervisor/cells/g085-restored/data
RELAY_CELL_ID=g085-cell-01 relay recovery restore --bundle "$bundle" --key-file "$key" --target-data-dir /srv/relay-host/supervisor/cells/g085-restored/data --cell-id g085-cell-01 --data-dir /srv/relay-host/supervisor/cells/g085-cell-01/data >/dev/null
sudo chown -R 10001:10001 /srv/relay-host/supervisor/cells/g085-restored/data
${hostCommand("start")} --cell-id g085-restored --operation-id g085-start-restored >/dev/null
for _ in $(seq 1 120); do curl -fsS http://127.0.0.1:4111/api/health/ready >/dev/null 2>&1 && break; sleep 1; done
restored_marker="$(sudo docker exec --user 10001:10001 relay-cell-g085-restored /nodejs/bin/node -e "process.stdout.write(require('fs').readFileSync('/var/lib/relay/uploads/g085-marker.txt','utf8'))")"
test "$restored_marker" = "g085-survives-provider-recovery"
${hostCommand("stop")} --cell-id g085-restored --operation-id g085-stop-restored >/dev/null

sudo chown -R relay:relay /srv/relay-host/supervisor/cells/g085-cell-03/data
${hostCommand("purge")} --cell-id g085-cell-03 --confirm g085-cell-03 --operation-id g085-purge-03 >/dev/null
${hostCommand("create")} --manifest /home/relay/g085-input/g085-rollback.json --operation-id g085-create-rollback >/dev/null
${hostCommand("start")} --cell-id g085-rollback --operation-id g085-start-rollback >/dev/null
for _ in $(seq 1 120); do curl -fsS http://127.0.0.1:4112/api/health/ready >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:4112/api/health/ready >/dev/null
${hostCommand("stop")} --cell-id g085-rollback --operation-id g085-stop-rollback >/dev/null
sudo chown -R relay:relay /srv/relay-host/supervisor/cells/g085-rollback/data
${hostCommand("purge")} --cell-id g085-rollback --confirm g085-rollback --operation-id g085-purge-rollback >/dev/null

printf '{"status":"pass","bundleDigest":"sha256:%s","restoredMarker":"%s","replacementVersion":"${versions.replacementVersion}","rollbackVersion":"${versions.rollbackVersion}","rollbackImage":"%s"}\\n' \
  "$digest" "$restored_marker" ${JSON.stringify(G085_LIVE_PROFILE.priorCellImage)}
`;
}

async function conformance(context) {
  if (!existsSync(secretPath(context))) fail("G085_LIVE_SECRETS_MISSING", "Run the G-085 bootstrap stage first.");
  const inputDir = prepareInputs(context);
  try {
    sshRun(context, "set -euo pipefail\nrm -rf /home/relay/g085-input\nmkdir -m 700 /home/relay/g085-input\n");
    scp(context, [path.join(inputDir, "host.license.json"), ...Array.from({ length: 11 }, (_, i) => path.join(inputDir, `g085-cell-${String(i + 1).padStart(2, "0")}.json`)), path.join(inputDir, "g085-restored.json"), path.join(inputDir, "g085-rollback.json")]);
    const lifecycle = jsonLine(sshRun(context, conformanceScript(context), {
      timeout: 1_800_000,
      code: "G085_HOST_CONFORMANCE_FAILED",
    }));
    appendReceipt(context, "host-cell", { reasonCode: "G085_HOST_CELL_PASSED", ...lifecycle });
    const task = await runTaskProof(context);
    appendReceipt(context, "runtime-task", { reasonCode: "G085_RUNTIME_TASK_PASSED", ...task });
    const recovery = jsonLine(sshRun(context, recoveryScript(context), {
      timeout: 1_800_000,
      code: "G085_RECOVERY_FAILED",
    }));
    appendReceipt(context, "recovery", { reasonCode: "G085_RECOVERY_PASSED", ...recovery });
    console.log(JSON.stringify({ status: "pass", stage: "conformance", origin: context.origin }, null, 2));
  } finally {
    rmSync(inputDir, { recursive: true, force: true });
  }
}

function cleanupScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
export RELAY_DATA_DIR=/srv/relay-host/data
export RELAY_HOST_ROOT=/srv/relay-host/supervisor
if [ -f /srv/relay-host/supervisor/host.db ]; then
  inventory="$(${hostCommand("inventory")})"
  mapfile -t cleanup_cells < <(printf '%s' "$inventory" | jq -r '.cells[] | select(.actualState != "purged" and .actualState != "exported") | .cellId')
  for cell in "\${cleanup_cells[@]}"; do
    sudo chown -R relay:relay "/srv/relay-host/supervisor/cells/$cell/data"
    ${hostCommand("purge")} --cell-id "$cell" --confirm "$cell" --operation-id "g085-cleanup-$cell" >/dev/null
  done
fi
sudo docker rm -f relay-g085-ollama >/dev/null 2>&1 || true
sudo docker volume rm relay-g085-ollama >/dev/null 2>&1 || true
sudo systemctl stop relay-host >/dev/null 2>&1 || true
sudo docker rm -f relay-g085-caddy >/dev/null 2>&1 || true
rm -rf /home/relay/g085-input /home/relay/.relay-g085-recovery.key
sudo rm -f /etc/relay-host.env
remaining="$(sudo docker ps -a --filter label=orionfold.relay.host-id=g085-host --format '{{.Names}}' | wc -l | tr -d ' ')"
test "$remaining" = "0"
printf '{"status":"pass","runtimeContainers":0,"remoteSecretsRemoved":true}\\n'
`;
}

function cleanup(context) {
  const result = jsonLine(sshRun(context, cleanupScript(), { timeout: 600_000, code: "G085_LIVE_CLEANUP_FAILED" }));
  rmSync(secretPath(context), { force: true });
  appendReceipt(context, "remote-cleanup", { reasonCode: "G085_REMOTE_CLEANUP_PASSED", ...result });
  console.log(JSON.stringify({ status: "pass", stage: "cleanup" }, null, 2));
}

async function main() {
  const { command, values } = parse(process.argv.slice(2));
  if (!command || command === "help") {
    console.log(USAGE);
    return command === "help" ? 0 : 1;
  }
  const stateFile = required(values, "state");
  const keyPath = required(values, "private-key");
  const evidenceDir = required(values, "evidence-dir");
  if (!existsSync(keyPath)) fail("G085_LIVE_KEY_MISSING", `Disposable SSH key is missing: ${keyPath}`);
  const state = loadG085ProviderState(stateFile);
  const context = {
    state,
    keyPath,
    evidenceDir,
    knownHostsPath: path.join(evidenceDir, "known_hosts"),
    ip: state.resourceIds.reservedIp,
    origin: `https://${g085Hostname(state)}`,
  };
  mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
  switch (command) {
    case "bootstrap":
      await bootstrap(context);
      return 0;
    case "conformance":
      await conformance(context);
      return 0;
    case "cleanup":
      cleanup(context);
      return 0;
    default:
      fail("G085_LIVE_COMMAND_UNKNOWN", `Unknown command: ${command}`);
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  const named = error instanceof DigitalOceanG085LiveError
    ? error
    : new DigitalOceanG085LiveError("G085_LIVE_UNEXPECTED", error instanceof Error ? error.message : String(error));
  console.error(`${named.code}: ${named.message}`);
  if (named.details) console.error(JSON.stringify(redactLiveReceipt(named.details), null, 2));
  process.exitCode = 1;
}
