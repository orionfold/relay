import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";

import {
  readTarEntries,
  scanEntries,
  scanTarBuffer,
} from "./check-public-boundary.mjs";

function tarEntry(name, content) {
  const body = Buffer.from(content, "utf8");
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header.fill(0x20, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

function tar(entries) {
  return Buffer.concat([
    ...entries.map(([name, content]) => tarEntry(name, content)),
    Buffer.alloc(1024),
  ]);
}

test("rejects every private-residue class with a named finding", () => {
  const cases = [
    ["notes.md", "Run in /Users/manavsehgal/orionfold/relay", "machine-path"],
    ["notes.md", "Copy from ~/orionfold/strategy/relay", "private-peer-project"],
    ["notes.md", "Visit https://buy.ainative.io/SOLO", "retired-domain"],
    ["notes.md", "Email manav@orionfold.com", "personal-contact"],
    ["notes.md", "See github.com/manavsehgal/stagent", "personal-repository"],
    ["notes.md", "Published by manavsehgal", "personal-handle"],
    ["notes.md", "Resume from HANDOFF.md", "operational-continuity-reference"],
    ["notes.md", "See .claude/plans/session-plan.md", "operational-continuity-reference"],
    ["HANDOFF.md", "live work", "internal-path"],
    ["docs/superpowers/plans/old.md", "history", "internal-path"],
  ];

  for (const [file, content, expectedRule] of cases) {
    const findings = scanEntries([{ path: file, content }]);
    assert.ok(
      findings.some(({ rule }) => rule === expectedRule),
      `${file} should produce ${expectedRule}: ${JSON.stringify(findings)}`,
    );
  }
});

test("permits portable examples, historical names, and the scoped author attribution", () => {
  const findings = scanEntries([
    { path: "docs/example.md", content: "Use /Users/alice/project or /home/user/project." },
    { path: "src/migrate.ts", content: "Migrate the historical stagent package." },
    {
      path: "README.md",
      content: "Copyright [Manav Sehgal](https://github.com/manavsehgal)",
    },
  ]);
  assert.deepEqual(findings, []);
});

test("reads and scans an uncompressed Git archive tar", () => {
  const buffer = tar([
    ["docs/public.md", "Public contributor guidance"],
    ["HANDOFF.md", "private continuity"],
  ]);
  assert.deepEqual(
    readTarEntries(buffer).map(({ path }) => path),
    ["docs/public.md", "HANDOFF.md"],
  );
  const findings = scanTarBuffer(buffer, { surface: "Git archive" });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "internal-path");
});

test("normalizes package/ paths and scans a gzipped npm tarball", () => {
  const buffer = gzipSync(
    tar([
      ["package/src/index.js", "export const ok = true;"],
      ["package/docs/leak.md", "contact sehgal.manav@gmail.com"],
    ]),
  );
  const findings = scanTarBuffer(buffer, { compressed: true, surface: "npm tarball" });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, "docs/leak.md");
  assert.equal(findings[0].rule, "personal-contact");
});

test("fails closed on malformed tar input", () => {
  const malformed = tarEntry("bad.txt", "body").subarray(0, 514);
  assert.throws(() => readTarEntries(malformed), /truncated tar entry/);
  assert.throws(
    () => scanTarBuffer(Buffer.alloc(1024), { surface: "empty archive" }),
    /contains no files/,
  );

  const badChecksum = tar([["bad.txt", "body"]]);
  badChecksum[0] ^= 1;
  assert.throws(() => readTarEntries(badChecksum), /invalid tar header checksum/);
});
