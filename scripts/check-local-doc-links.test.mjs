import assert from "node:assert/strict";
import test from "node:test";

import { findBrokenLinks } from "./check-local-doc-links.mjs";

test("resolves relative, root, directory, fragment, and line-suffixed links", () => {
  const tracked = new Set([
    "README.md",
    "docs/policy.md",
    "docs/trust/continuity.md",
    "src/index.ts",
  ]);
  const findings = findBrokenLinks(
    [
      {
        path: "docs/policy.md",
        content:
          "[readme](../README.md) [trust](trust/) [source](../src/index.ts:12) " +
          "[heading](#classification) [web](https://example.com)",
      },
    ],
    tracked,
  );
  assert.deepEqual(findings, []);
});

test("does not accept an untracked file merely because it exists on disk", () => {
  const findings = findBrokenLinks(
    [{ path: "docs/policy.md", content: "[private](../HANDOFF.md)" }],
    new Set(["docs/policy.md"]),
  );
  assert.deepEqual(findings, [
    {
      sourcePath: "docs/policy.md",
      line: 1,
      target: "../HANDOFF.md",
      resolved: "HANDOFF.md",
    },
  ]);
});

test("ignores illustrative links inside inline and fenced code", () => {
  const findings = findBrokenLinks(
    [
      {
        path: "docs/policy.md",
        content: "Use `[label](href)`.\n```md\n[template](feature-name.md)\n```",
      },
    ],
    new Set(["docs/policy.md"]),
  );
  assert.deepEqual(findings, []);
});
