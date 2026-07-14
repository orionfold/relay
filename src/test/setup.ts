import "@testing-library/jest-dom/vitest";
import {
  createWorkerDataDir,
  TestHarnessConfigurationError,
} from "./harness";

// DOM shims only apply under the default jsdom environment. Test files that
// opt into `@vitest-environment node` (pure fs/network modules) have no
// HTMLElement, and this setup file runs for every environment.
if (typeof HTMLElement !== "undefined") {
  // Mock ResizeObserver for cmdk
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  // Mock scrollIntoView for cmdk
  HTMLElement.prototype.scrollIntoView = () => {};

  // Mock pointer-capture API for Radix DropdownMenu / Select / etc.
  // JSDOM lacks these, and Radix bails out of opening menus when they're missing.
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = () => {};
}

const harnessRoot = process.env.RELAY_TEST_HARNESS_ROOT;
if (!harnessRoot) {
  throw new TestHarnessConfigurationError(
    "Relay default tests require the marked global test harness root"
  );
}

const workerId =
  process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID ?? "single";
process.env.RELAY_DATA_DIR = createWorkerDataDir(harnessRoot, workerId);
