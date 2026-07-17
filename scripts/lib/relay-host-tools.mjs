import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { x as extractTar } from "tar";
import { RelayHostArtifactPolicyError } from "./relay-host-artifact-policy.mjs";

function platformKey() {
  const os = process.platform === "darwin" ? "darwin" : process.platform;
  const arch = process.arch === "x64" ? "x64" : process.arch;
  return `${os}-${arch}`;
}

function verifyBinary(path, version) {
  const result = spawnSync(path, ["--version"], { encoding: "utf8" });
  if (result.status !== 0 || !`${result.stdout}${result.stderr}`.includes(`Version: ${version}`)) {
    throw new RelayHostArtifactPolicyError(
      "ARTIFACT_TOOL_VERSION_MISMATCH",
      `Trivy ${version} is required at ${path}`,
      { output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() },
    );
  }
  return path;
}

async function download(url, destination) {
  let response;
  try {
    response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  } catch (cause) {
    throw new RelayHostArtifactPolicyError("ARTIFACT_TOOL_DOWNLOAD_FAILED", `failed to download ${url}`, {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
  if (!response.ok) {
    throw new RelayHostArtifactPolicyError("ARTIFACT_TOOL_DOWNLOAD_FAILED", `download returned ${response.status}: ${url}`);
  }
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
}

export async function ensureTrivy(policy, cacheRoot) {
  if (process.env.RELAY_TRIVY_BIN) return verifyBinary(resolve(process.env.RELAY_TRIVY_BIN), policy.scanner.version);
  const artifact = policy.scanner.artifacts[platformKey()];
  if (!artifact) {
    throw new RelayHostArtifactPolicyError(
      "ARTIFACT_TOOL_UNAVAILABLE",
      `Trivy ${policy.scanner.version} has no pinned artifact for ${platformKey()}`,
    );
  }
  const toolDir = resolve(cacheRoot, `trivy-${policy.scanner.version}-${platformKey()}`);
  const binary = join(toolDir, "trivy");
  mkdirSync(toolDir, { recursive: true });
  const archive = join(toolDir, artifact.file);
  if (!existsSync(archive)) {
    await download(`${policy.scanner.releaseBaseUrl}/${artifact.file}`, archive);
  }
  const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (actual !== artifact.sha256) {
    throw new RelayHostArtifactPolicyError(
      "ARTIFACT_TOOL_DIGEST_MISMATCH",
      `Trivy archive digest mismatch for ${artifact.file}`,
      { expected: artifact.sha256, actual },
    );
  }
  // The archive checksum is the trust root. Re-extract on every invocation so
  // a writable cached executable can never be accepted by version text alone.
  await extractTar({ file: archive, cwd: toolDir, strict: true });
  chmodSync(binary, 0o700);
  return verifyBinary(binary, policy.scanner.version);
}
