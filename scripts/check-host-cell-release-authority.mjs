import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function checkHostCellReleaseAuthority({ packageJson, release }) {
  const version = packageJson?.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("HOST_CELL_AUTHORITY_PACKAGE_VERSION_INVALID");
  }
  if (release?.schema !== "orionfold.relay-cell-release/v1") {
    throw new Error("HOST_CELL_AUTHORITY_SCHEMA_INVALID");
  }
  if (release.relayVersion !== version) {
    throw new Error(`HOST_CELL_AUTHORITY_VERSION_MISMATCH package=${version} cell=${release.relayVersion ?? "missing"}`);
  }
  if (release.sourceTag !== `cell-v${version}`) {
    throw new Error(`HOST_CELL_AUTHORITY_TAG_MISMATCH expected=cell-v${version} actual=${release.sourceTag ?? "missing"}`);
  }
  if (release.imageRepository !== "ghcr.io/orionfold/relay-cell") {
    throw new Error("HOST_CELL_AUTHORITY_REPOSITORY_INVALID");
  }
  if (typeof release.imageDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(release.imageDigest)) {
    throw new Error("HOST_CELL_AUTHORITY_DIGEST_INVALID");
  }
  return { version, sourceTag: release.sourceTag, imageDigest: release.imageDigest };
}

export function checkHostCellReleaseAuthorityFiles(root = process.cwd()) {
  return checkHostCellReleaseAuthority({
    packageJson: readJson(path.join(root, "package.json")),
    release: readJson(path.join(root, "src/lib/host/deployment/relay-cell-release.json")),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = checkHostCellReleaseAuthorityFiles();
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
