import { existsSync } from "node:fs";
import { createHarnessRoot, removeHarnessRoot } from "./harness";

export default function globalSetup() {
  const previousDataDir = process.env.RELAY_DATA_DIR;
  const previousHarnessRoot = process.env.RELAY_TEST_HARNESS_ROOT;
  const { root, nonce } = createHarnessRoot();

  // Global setup runs before Vitest creates workers. Always replace inherited
  // application state rather than trusting or inspecting it.
  process.env.RELAY_TEST_HARNESS_ROOT = root;
  process.env.RELAY_DATA_DIR = root;

  // Vitest calls global teardown before closing its worker pool. Deleting here
  // works on Unix but can fail on Windows while SQLite handles remain open.
  // The parent process exit hook runs synchronously after worker shutdown.
  process.once("exit", () => {
    try {
      removeHarnessRoot(root, nonce);
      if (process.env.RELAY_TEST_REPORT_HARNESS_ROOT === "1") {
        console.log(
          `[relay-test-harness] removed=${JSON.stringify(root)} exists=${existsSync(root)}`
        );
      }
    } catch (error) {
      process.exitCode = 1;
      console.error(
        `[relay-test-harness] cleanup failed for ${JSON.stringify(root)}:`,
        error
      );
    }
  });

  if (process.env.RELAY_TEST_REPORT_HARNESS_ROOT === "1") {
    console.log(`[relay-test-harness] root=${JSON.stringify(root)}`);
  }

  return () => {
    if (previousDataDir === undefined) delete process.env.RELAY_DATA_DIR;
    else process.env.RELAY_DATA_DIR = previousDataDir;
    if (previousHarnessRoot === undefined) delete process.env.RELAY_TEST_HARNESS_ROOT;
    else process.env.RELAY_TEST_HARNESS_ROOT = previousHarnessRoot;
  };
}
