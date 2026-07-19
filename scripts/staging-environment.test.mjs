import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { isolatedStagingEnvironment } from "./lib/staging-environment.mjs";

test("staging binds app and Host state inside one disposable root", () => {
  const dataDir = path.resolve("/tmp/relay-staging-contract");
  const env = isolatedStagingEnvironment(dataDir);

  assert.equal(env.RELAY_DATA_DIR, dataDir);
  assert.equal(env.RELAY_HOST_ROOT, path.join(dataDir, "host"));
  assert.equal(env.RELAY_DEV_MODE, "");
  assert.equal(env.RELAY_INSTANCE_MODE, "");
});
