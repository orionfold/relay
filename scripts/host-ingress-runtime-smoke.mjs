import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "relay-host-ingress-smoke-"));
const port = await availablePort();
const networkOrigin = `http://127.0.0.1:${port}`;
const profile = process.env.RELAY_SMOKE_PROFILE || "private-authenticated";
const publicOrigin = profile === "remote-authenticated" ? "https://relay.example.test" : networkOrigin;
const ingressToken = "runtime-smoke-ingress";
const ingressHeaders = profile === "remote-authenticated"
  ? {
      "x-relay-ingress-token": ingressToken,
      "x-forwarded-proto": "https",
      "x-forwarded-host": "relay.example.test",
      "x-forwarded-for": "192.0.2.25",
    }
  : {};
let child;
let outputTail = "";

try {
  const bootstrap = spawnSync(
    process.execPath,
    ["dist/cli.js", "auth", "bootstrap", "--data-dir", dataDir],
    { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, RELAY_DEV_MODE: "true" } },
  );
  if (bootstrap.status !== 0) throw new Error(`bootstrap command failed: ${bootstrap.stderr}`);
  const token = bootstrap.stdout.match(/^[A-Za-z0-9_-]{40,}$/m)?.[0];
  if (!token) throw new Error("bootstrap command did not return a credential");

  child = spawn("npm", ["run", "dev", "--", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RELAY_DATA_DIR: dataDir,
      RELAY_DEV_MODE: "true",
      RELAY_EXPOSURE_PROFILE: profile,
      RELAY_PUBLIC_ORIGIN: publicOrigin,
      ...(profile === "remote-authenticated" ? { RELAY_INGRESS_TOKEN: ingressToken } : {}),
      RELAY_ROUTE_PREFIX: "/",
      RELAY_CELL_ID: "runtime-smoke-cell",
      RELAY_INTERNAL_AUTH_TOKEN: "runtime-smoke-internal",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on("data", (chunk) => {
      outputTail = `${outputTail}${chunk}`.slice(-8_000);
    });
  }

  await waitFor(`${networkOrigin}/api/health/live`, { headers: ingressHeaders });
  await expectStatus(`${networkOrigin}/api/tasks`, 401, { headers: ingressHeaders });
  await expectStatus(`${networkOrigin}/auth/setup`, 200, { headers: ingressHeaders });

  const setup = await fetch(`${networkOrigin}/api/auth/bootstrap`, {
    method: "POST",
    headers: { ...ingressHeaders, origin: publicOrigin, "content-type": "application/json" },
    body: JSON.stringify({
      token,
      password: "runtime smoke password",
      deviceName: "Runtime smoke browser",
    }),
  });
  if (setup.status !== 200) throw new Error(`setup returned ${setup.status}: ${await setup.text()}`);
  const setupBody = await setup.json();
  if (!Array.isArray(setupBody.recoveryCodes) || setupBody.recoveryCodes.length !== 8) {
    throw new Error("setup did not return exactly eight recovery codes");
  }
  const cookie = setup.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie?.startsWith("relay_session=")) throw new Error("setup did not issue an HttpOnly session cookie");

  const statusWithCookie = await fetch(`${networkOrigin}/api/auth/status`, { headers: { ...ingressHeaders, cookie } });
  const statusBody = await statusWithCookie.json();
  if (!statusBody.authenticated) {
    throw new Error(`new session cookie was not recognized (cookie length ${cookie.length})`);
  }
  await expectStatus(`${networkOrigin}/api/auth/sessions`, 200, { headers: { ...ingressHeaders, cookie } });
  await expectStatus(`${networkOrigin}/api/auth/logout`, 403, {
    method: "POST",
    headers: { ...ingressHeaders, cookie, origin: "http://foreign.example" },
  });
  await expectStatus(`${networkOrigin}/api/auth/logout`, 200, {
    method: "POST",
    headers: { ...ingressHeaders, cookie, origin: publicOrigin },
  });
  await expectStatus(`${networkOrigin}/api/tasks`, 401, { headers: { ...ingressHeaders, cookie } });

  console.log(JSON.stringify({
    ok: true,
    profile,
    checks: ["health", "unauthenticated refusal", "setup page", "bootstrap", "session", "CSRF", "logout", "revocation"],
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (outputTail) console.error(outputTail);
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) child.kill("SIGTERM");
  rmSync(dataDir, { recursive: true, force: true });
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => port ? resolve(port) : reject(new Error("port allocation failed")));
    });
  });
}

async function waitFor(url, init) {
  const deadline = Date.now() + 30_000;
  let lastObservation = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return;
      lastObservation = `${response.status} ${await response.text()}`;
    } catch (error) {
      lastObservation = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become ready: ${url} (${lastObservation})`);
}

async function expectStatus(url, expected, init) {
  const response = await fetch(url, init);
  if (response.status !== expected) {
    throw new Error(`${url} returned ${response.status}, expected ${expected}: ${await response.text()}`);
  }
}
