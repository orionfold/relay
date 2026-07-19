// End-to-end smoke for the npx production-build path
// (feat-ship-production-build-for-npx, #10). Modeled on the Tauri-era
// desktop-sidecar-smoke.mjs (172fedb1).
//
// Simulates a customer install in a clean temp dir:
//   npm pack → npm install <tarball> → node dist/cli.js
// with RELAY_BUILD_ARTIFACT_URL pointing at a local artifact (file://), so no
// network or GitHub Release is needed.
//
// Cases:
//   A. First run downloads + verifies + extracts the artifact, launches
//      `next start` (Mode: production), serves /, /chat, /tasks, /workflows,
//      serves a /_next/static asset, and never prints the dev-only
//      "Can't resolve" transport warning (#8) or spins up HMR (#7).
//   B. Second run (secure LAN bind --hostname 0.0.0.0): no re-download, still
//      production, and /_next/* serves to the configured LAN origin — the
//      #13/#5/#6/#11/#12 class check (`next start` has no dev-origin gate).
//   L. License lifecycle (feat-license-lifecycle, PLG-1 Mode C buy-simulation):
//      `relay license add` with the REAL prod-signed fixture → activation
//      ceremony; `license status` valid; a premium pack installs with NO
//      --license-url (store consult); the launch banner reads "Licensed to";
//      seed refuses with an explanatory 403 without RELAY_STAGING; rm the license store → banner
//      reverts to Community Edition, the pack STAYS installed (D4), and
//      RELAY_STAGING=true opens seed/clear on the prod build (PLG-S).
//   L2. Bundle install (pack-bundle-model): the CLI resolves a BUNDLE pack
//      (relay-agency-cre) by bare name from the tarball, refuses unlicensed on
//      the bundle's OWN entitlement, then under the license flattens its two
//      children into ONE app reporting the MERGED counts (5 tables, no
//      duplicate client book) — the flatten path unit tests can't reach at the
//      CLI boundary.
//   C. Broken artifact URL: loud "Could not set up the production build"
//      warning and a working dev-mode fallback (the status-quo floor).
//   P/T/TC/TB. Publish gates: price drift, pack taxonomy drift, pack compat
//      drift, and pack tarball allowlist/size.
//
// Prereqs: `npm run build && node scripts/build-prebuilt-artifact.mjs`
// (CI runs both). The script runs `npm run build:cli` + `npm pack` itself.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Shared launch/CLI helpers — the SAME module the operator staging driver
// (scripts/staging.mjs) imports, so the two harnesses never drift (PLG-S / S1).
import {
  assert,
  launchCli,
  reserveLoopbackPort,
  run,
  runCliCommand,
  stopChild,
  waitForHttpOk,
  waitForOutput,
} from "./lib/harness.mjs";
// Publish-gate price-drift check (relay-channel later-12): the pack's
// hand-maintained price must not contradict the Website's canonical
// pricing.json. Fail-open offline; fail loud on a reachable contradiction.
import { checkPriceDrift } from "./check-price-drift.mjs";
// Publish-gate pack-taxonomy check (R3): every pack manifest's declared logical
// table/schedule ids must reconcile against the codified owned-primitive
// registry (src/lib/packs/taxonomy.ts → taxonomy.json). LOCAL check, fail-CLOSED.
import { runCheck as runTaxonomyCheck } from "./check-pack-taxonomy.mjs";
// Publish-gate pack-compat check (R5): current bundled pack manifests must stay
// backward-compatible with the last published baseline unless a pack raises its
// relayCore major. LOCAL git-baseline check, fail-CLOSED.
import { runCheck as runCompatCheck } from "./check-pack-compat.mjs";
// Publish-gate pack-tarball check (R4, features/pack-tarball-diet.md): the
// declared BUNDLED_PACK_IDS allowlist must equal what physically ships under
// templates/, and the unpacked template size must stay under budget (the
// deferral trigger for the tarball diet).
import { runCheck as runTarballCheck } from "./check-pack-tarball.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf-8"));

const PROD_START_TIMEOUT_MS = 120_000;
const DEV_FALLBACK_TIMEOUT_MS = 300_000; // next dev compiles on demand — generous

const artifactArgIndex = process.argv.indexOf("--artifact");
const artifactPath =
  artifactArgIndex !== -1
    ? path.resolve(process.argv[artifactArgIndex + 1])
    : path.join(repoRoot, "dist-artifacts", `relay-next-build-${pkg.version}.tgz`);

async function main() {
  assert(existsSync(artifactPath), `artifact missing at ${artifactPath} — run npm run build && node scripts/build-prebuilt-artifact.mjs`);
  assert(existsSync(`${artifactPath}.sha256`), `checksum sidecar missing at ${artifactPath}.sha256`);

  // Pack the npm tarball exactly as publish would.
  await run("npm", ["run", "build:cli"], { cwd: repoRoot });
  await run("npm", ["pack"], { cwd: repoRoot });
  const tarballPath = path.join(repoRoot, `orionfold-relay-${pkg.version}.tgz`);
  assert(existsSync(tarballPath), `npm pack did not produce ${tarballPath}`);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "relay-npx-smoke-"));
  const installDir = path.join(workDir, "install");
  mkdirSync(installDir, { recursive: true });
  writeFileSync(
    path.join(installDir, "package.json"),
    JSON.stringify({ name: "relay-smoke-install", private: true }, null, 2),
  );

  console.log(`\n[smoke] Installing tarball into ${installDir} (this mirrors npx; takes a few minutes)...`);
  await run("npm", ["install", "--no-audit", "--no-fund", tarballPath], { cwd: installDir });

  const artifactUrl = pathToFileURL(artifactPath).href;
  let productionAssetPath;

  // ---- Case A: first run — download, verify, extract, next start ----
  console.log("\n[smoke] Case A: first run → production mode");
  {
    const dataDir = path.join(workDir, "data-a");
    const port = await reserveLoopbackPort();
    const { child, getOutput } = launchCli({ installDir, dataDir, port, artifactUrl });
    try {
      await waitForOutput(getOutput, /Mode: production/, PROD_START_TIMEOUT_MS, "production banner");
      assert(/Downloading production build/.test(getOutput()), "first run should announce the download");

      const html = await waitForHttpOk(`http://127.0.0.1:${port}/`, PROD_START_TIMEOUT_MS);
      for (const route of ["/chat", "/tasks", "/workflows"]) {
        await waitForHttpOk(`http://127.0.0.1:${port}${route}`, 30_000);
      }

      // #7: production serves static assets, no HMR websocket endpoint.
      const assetMatch = html.match(/\/_next\/static\/[^"']+\.(?:js|css)/);
      assert(assetMatch, "homepage HTML should reference /_next/static assets");
      productionAssetPath = assetMatch[0];
      const asset = await fetch(`http://127.0.0.1:${port}${productionAssetPath}`);
      assert(asset.status === 200, `/_next/static asset should serve (got ${asset.status})`);
      assert(!html.includes("webpack-hmr"), "production HTML must not wire up the HMR socket (#7)");

      // #8: the dev-only dynamic-import compile warning must be gone.
      assert(!getOutput().includes("Can't resolve"), "no <dynamic> resolve warning in production (#8)");
      assert(!getOutput().includes("Could not set up the production build"), "no fallback warning on the happy path");
    } finally {
      await stopChild(child);
    }
  }

  // ---- Case B: second run + LAN bind — cached, still production, no origin gate ----
  console.log("\n[smoke] Case B: second run, secure LAN bind → cross-origin /_next/*");
  {
    const dataDir = path.join(workDir, "data-a"); // same data dir: exercise the cache/no-op path
    const port = await reserveLoopbackPort();
    const publicOrigin = `http://192.168.99.99:${port}`;
    const { child, getOutput } = launchCli({
      installDir,
      dataDir,
      port,
      artifactUrl,
      hostname: "0.0.0.0",
      exposureProfile: "private-authenticated",
      publicOrigin,
    });
    try {
      await waitForOutput(getOutput, /Mode: production/, PROD_START_TIMEOUT_MS, "production banner");
      assert(/Exposure: private-authenticated/.test(getOutput()), "LAN run must use authenticated exposure");
      assert(!/Downloading production build/.test(getOutput()), "second run must not re-download");
      assert(productionAssetPath, "Case A must capture a production static-asset path");
      // Simulate the Windows-browser→Alpine-VM LAN client: a cross-origin
      // request for a dev asset. In dev mode Next's origin gate blocks this
      // class (#13 et al.); `next start` must serve it. The TCP probe uses
      // loopback because 192.168.99.99 is a synthetic browser-visible origin.
      const crossOrigin = await fetch(`http://127.0.0.1:${port}${productionAssetPath}`, {
        headers: {
          Origin: publicOrigin,
          Referer: `${publicOrigin}/`,
        },
      });
      assert(
        crossOrigin.status === 200,
        `cross-origin /_next/* must serve in production (got ${crossOrigin.status})`,
      );
    } finally {
      await stopChild(child);
    }
  }

  // ---- Case L: license lifecycle — the Mode C buy-simulation (PLG-1) ----
  console.log("\n[smoke] Case L: license lifecycle (redeem → ceremony → no-flag premium install → licensed banner → D4)");
  {
    const dataDir = path.join(workDir, "data-l");
    mkdirSync(dataDir, { recursive: true });

    // The "fulfilment email attachment": the real prod-signed fixture.
    const licenseSrc = path.join(
      repoRoot,
      "src/lib/licensing/__tests__/fixtures/of-relay-verify-20260701.license.json",
    );
    const licenseFixture = JSON.parse(readFileSync(licenseSrc, "utf8"));
    const licensedEmail = String(licenseFixture.payload?.issued_to?.email ?? "");
    assert(licensedEmail, "prod-signed license fixture must include an issued_to email");
    const licensedBanner = new RegExp(
      `Licensed to ${licensedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    );
    const licensePath = path.join(workDir, "my.license.json");
    writeFileSync(licensePath, readFileSync(licenseSrc));

    // 0. Unlicensed refusal: the REAL premium pack (relay-agency-pro, bundled
    //    in the tarball) must refuse by name with the license-required path
    //    BEFORE any license exists — the 402 soft-gate's CLI face.
    const refused = await runCliCommand({ installDir, dataDir, args: ["pack", "add", "relay-agency-pro"] });
    assert(refused.code !== 0, `unlicensed premium install must refuse (exit ${refused.code}):\n${refused.output}`);
    assert(
      /license/i.test(refused.output),
      `refusal must name the license path, not fail generically:\n${refused.output}`,
    );

    // 1. Redeem: verify + persist + activation ceremony.
    const add = await runCliCommand({ installDir, dataDir, args: ["license", "add", licensePath] });
    assert(add.code === 0, `license add should succeed (exit ${add.code}):\n${add.output}`);
    assert(/License verified/.test(add.output), "ceremony should confirm offline verification");
    assert(/OF-RELAY-VERIFY-20260701/.test(add.output), "ceremony should show the license ID");
    assert(/Your packs are yours forever\./.test(add.output), "ceremony should state the D4 promise");
    assert(
      existsSync(path.join(dataDir, "licenses", "OF-RELAY-VERIFY-20260701.license.json")),
      "license should persist under <data-dir>/licenses/",
    );

    // 2. Status re-verifies at read time.
    const status = await runCliCommand({ installDir, dataDir, args: ["license", "status"] });
    assert(status.code === 0 && /valid/.test(status.output), `license status should be valid:\n${status.output}`);

    // 3. The REAL premium pack installs by bare name with NO --license-url
    //    (store consult), materializing every primitive class it declares —
    //    including the month-end schedule row (engine fix 0b).
    const packAdd = await runCliCommand({ installDir, dataDir, args: ["pack", "add", "relay-agency-pro"] });
    assert(
      packAdd.code === 0 && /Installed relay-agency-pro@/.test(packAdd.output),
      `premium pack should install with no --license-url (exit ${packAdd.code}):\n${packAdd.output}`,
    );
    // Counts pinned to the CURRENT Agency Pro template. As of v0.5.0 (the
    // persona/industry split) Pro is the vertical-neutral automation layer:
    // the CRE renewal + nonprofit grant chapters moved to relay-cre /
    // relay-nonprofit, so Pro drops 6 profiles / 4 blueprints / 2 tables
    // (engagements + intake) and registers the 1 month-end schedule. Bump these
    // literals whenever the template's primitive set changes — this gate
    // failing on a stale count is by design.
    assert(/2 table\(s\)/.test(packAdd.output), `install should create both tables:\n${packAdd.output}`);
    assert(/6 profile\(s\)/.test(packAdd.output), `install should drop all 6 profiles:\n${packAdd.output}`);
    assert(/4 blueprint\(s\)/.test(packAdd.output), `install should drop all 4 blueprints:\n${packAdd.output}`);
    assert(/1 schedule\(s\)/.test(packAdd.output), `install should register the month-end schedule:\n${packAdd.output}`);
    const packList = await runCliCommand({ installDir, dataDir, args: ["pack", "list"] });
    assert(/relay-agency-pro.*\[premium\]/.test(packList.output), `pack list should mark [premium]:\n${packList.output}`);
    // The update surface: list shows the sidecar-recorded version.
    assert(/relay-agency-pro.*installed v0\.5\.0/.test(packList.output), `pack list should show the installed version:\n${packList.output}`);

    // 4. Launch: licensed banner (D3) + seed gate returns an explanatory 403
    //    without RELAY_STAGING. BUG-5 (#34, 0.26.0) replaced the old bare-null
    //    404 — which null-deref'd into a fake "Network error" in the UI — with
    //    a 403 carrying a plain-language `error` body. Assert both: the status
    //    AND that the refusal explains itself (the whole point of the fix).
    {
      const port = await reserveLoopbackPort();
      const { child, getOutput } = launchCli({ installDir, dataDir, port, artifactUrl });
      try {
        await waitForOutput(getOutput, licensedBanner, PROD_START_TIMEOUT_MS, "licensed banner");
        assert(!/Community Edition/.test(getOutput()), "a licensee is never greeted as Community Edition");
        await waitForHttpOk(`http://127.0.0.1:${port}/`, PROD_START_TIMEOUT_MS);
        const seed = await fetch(`http://127.0.0.1:${port}/api/data/seed`, { method: "POST" });
        assert(seed.status === 403, `seed must refuse with 403 in a customer-shaped prod run (got ${seed.status})`);
        const seedBody = await seed.json().catch(() => ({}));
        assert(
          typeof seedBody?.error === "string" && seedBody.error.length > 0,
          `seed refusal must carry an explanatory error body (got ${JSON.stringify(seedBody)})`
        );
      } finally {
        await stopChild(child);
      }
    }

    // 5. D4 proof: rm the license store → banner reverts, pack STAYS installed.
    //    Same relaunch opts into RELAY_STAGING=true → seed/clear open (PLG-S).
    rmSync(path.join(dataDir, "licenses"), { recursive: true, force: true });
    {
      const port = await reserveLoopbackPort();
      const { child, getOutput } = launchCli({
        installDir,
        dataDir,
        port,
        artifactUrl,
        extraEnv: { RELAY_STAGING: "true" },
      });
      try {
        await waitForOutput(getOutput, /Community Edition/, PROD_START_TIMEOUT_MS, "community banner after store removal");
        await waitForHttpOk(`http://127.0.0.1:${port}/`, PROD_START_TIMEOUT_MS);
        const seed = await fetch(`http://127.0.0.1:${port}/api/data/seed`, { method: "POST" });
        assert(seed.status === 200, `seed must open in staging prod mode (got ${seed.status})`);
        const clear = await fetch(`http://127.0.0.1:${port}/api/data/clear`, { method: "POST" });
        assert(clear.status === 200, `clear must open in staging prod mode (got ${clear.status})`);
      } finally {
        await stopChild(child);
      }
    }
    assert(
      existsSync(path.join(dataDir, "apps", "relay-agency-pro", "manifest.yaml")),
      "installed premium pack must SURVIVE license removal (D4)",
    );
    const listAfter = await runCliCommand({ installDir, dataDir, args: ["pack", "list"] });
    assert(/relay-agency-pro/.test(listAfter.output), "pack list still shows the pack after license removal (D4)");
  }

  // ---- Case L2: BUNDLE install — the flatten-at-install path (pack-bundle-model) ----
  // A bundle pack owns no manifest; installPack flattens its child packs into
  // ONE app at install (mergeBundle). Unit tests exercise mergeBundle in-process
  // (relay-agency-bundle-template.test.ts), but only the smoke proves the CLI
  // resolves a bundle by BARE NAME from the packaged tarball, gates on the
  // bundle's OWN entitlement, and reports the MERGED primitive counts. This case
  // was the last pre-tag gap flagged for the packs-evolution release cut.
  console.log("\n[smoke] Case L2: bundle install (relay-agency-cre → flatten Agency + CRE into one app)");
  {
    const dataDir = path.join(workDir, "data-l2");
    mkdirSync(dataDir, { recursive: true });
    // Reuse the same real prod-signed fixture already materialized for Case L.
    const licensePath = path.join(workDir, "my.license.json");

    // 0. Unlicensed refusal by bare name: the bundle's own entitlement gates,
    //    and it must refuse BEFORE any write (free/pro line survives).
    const refused = await runCliCommand({ installDir, dataDir, args: ["pack", "add", "relay-agency-cre"] });
    assert(refused.code !== 0, `unlicensed bundle install must refuse (exit ${refused.code}):\n${refused.output}`);
    assert(/license/i.test(refused.output), `bundle refusal must name the license path:\n${refused.output}`);
    assert(
      !existsSync(path.join(dataDir, "apps", "relay-agency-cre")),
      "a refused bundle must leave NO half-installed app dir",
    );

    // 1. Redeem the SAME real prod-signed license (one license unlocks every
    //    paid pack — the bundle is not a separate SKU).
    const add = await runCliCommand({ installDir, dataDir, args: ["license", "add", licensePath] });
    assert(add.code === 0, `license add should succeed for the bundle case (exit ${add.code}):\n${add.output}`);

    // 2. Install by bare name → the two children flatten into ONE app. The CLI
    //    reports the MERGED counts: persona (4 tables) + CRE (1 rent_roll) = 5,
    //    and profiles/blueprints from both children. The 5-table merge (no
    //    duplicate client book) is the whole point of the bundle model; bump
    //    this literal only when a child's table set changes.
    const packAdd = await runCliCommand({ installDir, dataDir, args: ["pack", "add", "relay-agency-cre"] });
    assert(
      packAdd.code === 0 && /Installed relay-agency-cre@/.test(packAdd.output),
      `bundle should install by bare name under the license (exit ${packAdd.code}):\n${packAdd.output}`,
    );
    assert(/5 table\(s\)/.test(packAdd.output), `bundle should flatten to 5 merged tables:\n${packAdd.output}`);

    // 3. It installs as ONE app under the bundle's id — not one-app-per-child.
    assert(
      existsSync(path.join(dataDir, "apps", "relay-agency-cre", "manifest.yaml")),
      "bundle must install as ONE app under the bundle id",
    );
    assert(
      !existsSync(path.join(dataDir, "apps", "relay-agency")) &&
        !existsSync(path.join(dataDir, "apps", "relay-cre")),
      "bundle flatten must NOT leave the children as separate installed apps",
    );
    const packList = await runCliCommand({ installDir, dataDir, args: ["pack", "list"] });
    assert(/relay-agency-cre.*\[premium\]/.test(packList.output), `bundle should list [premium]:\n${packList.output}`);
    // Only the bundle is an installed pack; strip its id from each line before
    // checking no child id leaked in as a separate entry (substring-safe).
    const listedChildAsPack = packList.output
      .split("\n")
      .some((line) => /\b(relay-agency|relay-cre)\b/.test(line.replace(/relay-agency-cre/g, "")));
    assert(
      !listedChildAsPack,
      `pack list must show only the bundle, not its flattened children:\n${packList.output}`,
    );
  }

  // ---- Case C: broken artifact URL — loud warning, dev-mode fallback boots ----
  console.log("\n[smoke] Case C: broken artifact URL → loud dev-mode fallback");
  {
    rmSync(path.join(installDir, ".next"), { recursive: true, force: true });
    const dataDir = path.join(workDir, "data-c");
    const port = await reserveLoopbackPort();
    const { child, getOutput } = launchCli({
      installDir,
      dataDir,
      port,
      artifactUrl: pathToFileURL(path.join(workDir, "no-such-artifact.tgz")).href,
    });
    try {
      await waitForOutput(
        getOutput,
        /Could not set up the production build/,
        PROD_START_TIMEOUT_MS,
        "loud fallback warning",
      );
      await waitForOutput(getOutput, /Mode: development/, PROD_START_TIMEOUT_MS, "dev-mode banner");
      await waitForHttpOk(`http://127.0.0.1:${port}/`, DEV_FALLBACK_TIMEOUT_MS);
    } finally {
      await stopChild(child);
    }
  }

  // ---- Case P: price drift — pack.yaml price vs the canonical pricing.json ----
  // Fail-OPEN if the canon is unreachable (a network blip must never block a
  // good release); fail LOUD only when a reachable canon contradicts the pack.
  console.log("\n[smoke] Case P: price drift (pack.yaml vs canonical pricing.json)");
  {
    const drift = await checkPriceDrift();
    if (drift.status === "skipped") {
      console.log(`[smoke] Case P: SKIPPED — canonical pricing unreachable (${drift.reason}); fail-open per ruling.`);
    } else if (drift.status === "drift") {
      for (const f of drift.findings) console.error(`  - ${f}`);
      assert(false, "Case P: pack.yaml price drifted from the canonical pricing.json (see findings above)");
    } else {
      console.log("[smoke] Case P: OK — pack.yaml price matches the canonical pricing.json.");
    }
  }

  // ---- Case T: pack-taxonomy drift — every manifest vs the codified registry ----
  // LOCAL, fail-CLOSED (no network): a pack that declares an owned id with
  // divergent columns, an unregistered id, or an owner-contract drift fails the
  // release. runTaxonomyCheck throws on a broken local input (missing/broken
  // taxonomy.json) — that is a real error, surfaced as a failed release.
  console.log("\n[smoke] Case T: pack-taxonomy drift (manifests vs codified registry)");
  {
    const tax = runTaxonomyCheck();
    if (tax.findings.length > 0) {
      for (const f of tax.findings) console.error(`  - ${f}`);
      assert(false, "Case T: a pack manifest drifted from src/lib/packs/taxonomy.ts (see findings above)");
    } else {
      console.log(
        `[smoke] Case T: OK — ${tax.packCount} manifest packs, ${tax.tableCount} tables + ${tax.scheduleCount} schedules, all owned + in-contract.`,
      );
    }
  }

  // ---- Case TC: pack-compat drift — current manifests vs last published baseline ----
  // LOCAL, fail-CLOSED: a pack update may add tables/columns/blueprints/schedules
  // but may not remove customer-visible contracts unless it raises relayCore's
  // major. The default baseline is origin/main; release CI can override it with
  // RELAY_PACK_COMPAT_BASE_REF when a tag is the sharper "last published" ref.
  console.log("\n[smoke] Case TC: pack-compat drift (current manifests vs baseline)");
  {
    const compat = runCompatCheck();
    if (compat.findings.length > 0) {
      for (const f of compat.findings) console.error(`  - ${f}`);
      assert(false, "Case TC: a pack manifest introduced a breaking change without a relayCore major bump (see findings above)");
    } else {
      console.log(
        `[smoke] Case TC: OK — ${compat.candidatePackCount} current packs vs ${compat.baselinePackCount} baseline packs at ${compat.baselineRef}; no breaking manifest drift.`,
      );
      for (const item of compat.allowed) console.log(`[smoke] Case TC allowed: ${item}`);
    }
  }

  // ---- Case TB: pack-tarball allowlist + size budget ----
  // LOCAL, fail-CLOSED: the bundled-pack allowlist (BUNDLED_PACK_IDS, mirrored
  // to bundled.json) must equal the physical templates/ set — a pack present
  // but undeclared would ship silently; one declared but missing would 404 under
  // npx (the files-allowlist trap). And the unpacked size must stay under budget
  // — crossing it means the tarball diet now pays off and forces the cut.
  console.log("\n[smoke] Case TB: pack-tarball allowlist + size budget");
  {
    const tb = runTarballCheck();
    if (tb.findings.length > 0) {
      for (const f of tb.findings) console.error(`  - ${f}`);
      assert(false, "Case TB: bundled-pack allowlist drift or size-budget overflow (see findings above)");
    } else {
      console.log(
        `[smoke] Case TB: OK — ${tb.present.length} bundled packs, ${tb.totalKb.toFixed(1)} KB / ${tb.budgetKb} KB budget, allowlist matches templates/.`,
      );
    }
  }

  await fs.rm(workDir, { recursive: true, force: true });
  rmSync(tarballPath, { force: true });
  console.log(
    "\n[smoke] npx production smoke passed: A (prod first run), B (cached + LAN), L (license lifecycle + staging gate), L2 (bundle flatten), C (loud fallback), P (price drift), T (pack-taxonomy drift), TC (pack-compat drift), TB (pack-tarball allowlist + size).",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
