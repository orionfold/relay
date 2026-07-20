import assert from "node:assert/strict";
import test from "node:test";
import { checkHostCellReleaseAuthority } from "./check-host-cell-release-authority.mjs";

const digest = `sha256:${"a".repeat(64)}`;
const packageJson = { version: "1.2.3" };
const release = {
  schema: "orionfold.relay-cell-release/v1",
  relayVersion: "1.2.3",
  imageRepository: "ghcr.io/orionfold/relay-cell",
  imageDigest: digest,
  sourceTag: "cell-v1.2.3",
};

test("accepts an exact package, Cell tag, and immutable digest binding", () => {
  assert.deepEqual(checkHostCellReleaseAuthority({ packageJson, release }), {
    version: "1.2.3",
    sourceTag: "cell-v1.2.3",
    imageDigest: digest,
  });
});

test("fails closed when npm would publish ahead of its Cell authority", () => {
  assert.throws(
    () => checkHostCellReleaseAuthority({
      packageJson: { version: "1.2.4" },
      release,
    }),
    /HOST_CELL_AUTHORITY_VERSION_MISMATCH/,
  );
});

test("rejects a mutable or malformed image reference", () => {
  assert.throws(
    () => checkHostCellReleaseAuthority({
      packageJson,
      release: { ...release, imageDigest: "latest" },
    }),
    /HOST_CELL_AUTHORITY_DIGEST_INVALID/,
  );
});
