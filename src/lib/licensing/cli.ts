/**
 * Testable command dispatcher for `relay license <action>` (D2 — the license
 * gets its own noun). Kept separate from bin/cli.ts so the argv → action
 * mapping is unit-tested without spawning the CLI; bin/cli.ts does thin
 * firstArg detection + a dynamic import of this module (TDR-032: never
 * statically pull licensing/store code into the CLI's default startup graph).
 *
 * Returns a process exit code (0 = success, 1 = error). All output goes
 * through the injected `io.log` / `io.error` — zero silent steps.
 */

export interface LicenseCommandIo {
  /** Override the store directory (tests). */
  dir?: string;
  /** Injected clock (tests). */
  now?: Date;
  /** Override the recap surface's pack dirs (tests). */
  appsDir?: string;
  templatesDir?: string;
  log: (message: string) => void;
  error: (message: string) => void;
}

const USAGE = [
  "Usage: relay license <action>",
  "  add <path-or-url>    verify + save a license (from your fulfilment email)",
  "  status               show saved licenses, entitlements and terms",
  "  remove <license-id>  remove a saved license (installed packs stay installed)",
].join("\n");

/**
 * The public perpetual-fallback commitment (D4) — wording operator-approved
 * 2026-07-01, keep verbatim in ceremony + README.
 */
const D4_PROMISE =
  "Your packs are yours forever. Renewal gets you the year's new and " +
  "updated packs + priority support.";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runLicenseCommand(
  argv: string[],
  io: LicenseCommandIo
): Promise<number> {
  const action = argv[0];
  const arg = argv[1];

  switch (action) {
    case "add":
      return runAdd(arg, io);
    case "status":
      return runStatus(io);
    case "remove":
      return runRemove(arg, io);
    default:
      io.error(`Unknown license action: ${action ?? "(none)"}`);
      io.error(USAGE);
      return 1;
  }
}

function formatIdentity(issuedTo: {
  email?: string;
  name?: string;
  org?: string;
}): string {
  // org → name → email, same precedence as the startup banner (D3/D7 — one
  // identity model everywhere).
  const label = issuedTo.org ?? issuedTo.name ?? issuedTo.email ?? "(unknown)";
  const email =
    issuedTo.email && label !== issuedTo.email ? ` <${issuedTo.email}>` : "";
  return `${label}${email}`;
}

function formatDay(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : "(unknown)";
}

async function runAdd(
  source: string | undefined,
  io: LicenseCommandIo
): Promise<number> {
  if (!source) {
    io.error(
      "Missing license path. Usage: relay license add <path-or-url to your .license.json>"
    );
    return 1;
  }
  try {
    const { loadLicense } = await import("./load");
    const { saveLicense } = await import("./store");
    const envelope = await loadLicense(source);
    const info = saveLicense(envelope, { dir: io.dir, now: io.now });

    // Activation ceremony — the "feel paid" moment: what changed, who you
    // are now, where the credential lives, and the D4 promise.
    io.log("✓ License verified — offline Ed25519, no server contact.");
    io.log("");
    io.log(`  Licensed to:  ${formatIdentity(info.issuedTo)}`);
    io.log(`  License ID:   ${info.licenseId}`);
    io.log(
      `  Term:         ${formatDay(info.issuedAt)} → ${formatDay(info.expiresAt)}`
    );
    if (info.seats != null) io.log(`  Seats:        ${info.seats}`);
    io.log(`  Unlocks:      ${info.entitlements.join(", ") || "(none)"}`);
    io.log(`  Stored at:    ${info.filePath}`);
    io.log("");
    io.log(
      "Relay now greets you as a licensee, and entitled packs install with no extra flags."
    );
    io.log(D4_PROMISE);
    return 0;
  } catch (err) {
    io.error(
      `Failed to add license: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}

/**
 * Fail-open recap lookup — the value-recap is decoration on this surface,
 * never a gate; any fault degrades to "no recap", not an error.
 */
async function pendingRecaps(
  entitlements: string[],
  io: LicenseCommandIo
): Promise<import("./recap").PackRecap[]> {
  try {
    const { entitledPackRecaps } = await import("./recap");
    return entitledPackRecaps(entitlements, {
      appsDir: io.appsDir,
      templatesDir: io.templatesDir,
    }).filter((r) => r.pending.length > 0);
  } catch {
    return [];
  }
}

async function runStatus(io: LicenseCommandIo): Promise<number> {
  try {
    const { listLicenses } = await import("./store");
    const now = io.now ?? new Date();
    const licenses = listLicenses({ dir: io.dir, now });

    if (licenses.length === 0) {
      io.log("No licenses saved.");
      io.log(
        "Redeem one with: relay license add <path-or-url to your .license.json>"
      );
      return 0;
    }

    for (const lic of licenses) {
      io.log(`${lic.licenseId}`);
      io.log(`  Licensed to:  ${formatIdentity(lic.issuedTo)}`);
      io.log(
        `  Term:         ${formatDay(lic.issuedAt)} → ${formatDay(lic.expiresAt)}`
      );
      if (lic.seats != null) io.log(`  Seats:        ${lic.seats}`);
      io.log(`  Entitlements: ${lic.entitlements.join(", ") || "(none)"}`);
      io.log(
        `  Status:       ${lic.valid ? "valid" : `invalid — ${lic.reason ?? "corrupt entry"}`}`
      );

      const recaps = await pendingRecaps(lic.entitlements, io);

      // Value recap (PLG-4a): entitled updates this license already paid for,
      // sitting uninstalled. Explicit invocation ⇒ informational, not a nag.
      if (lic.valid && recaps.length > 0) {
        io.log(`  Included in your term, waiting to install:`);
        for (const r of recaps) {
          for (const p of r.pending) {
            io.log(`    ${r.packName} v${p.version} — ${p.note}`);
          }
          io.log(`    → relay pack update ${r.packId}`);
        }
      }

      // D4: expiry warns about FUTURE premium installs/updates only — it
      // never gates anything already installed, so this is a nudge, not a block.
      if (lic.valid && lic.expiresAt) {
        const daysLeft = Math.floor(
          (new Date(lic.expiresAt).getTime() - now.getTime()) / DAY_MS
        );
        if (daysLeft <= 30) {
          io.log(
            `  ⚠ Renewal:    expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. ` +
              `Your installed packs are yours forever; renewing keeps new premium ` +
              `packs and updates flowing.`
          );
          // The generic promise gains this year's specific evidence.
          const latest = recaps
            .map((r) => ({ r, p: r.pending[r.pending.length - 1] }))
            .filter((x) => x.p);
          for (const { r, p } of latest) {
            io.log(
              `                This license year delivered ${r.packName} v${p.version} — ${p.note}`
            );
          }
        }
      }

      // Expired license, renewal-voiced (same voice as the update gate): what
      // renewal unlocks, never a threat to installed content.
      if (!lic.valid && /expired/i.test(lic.reason ?? "") && recaps.length > 0) {
        io.log(
          `  Your installed packs keep working — nothing is locked. Renewing unlocks:`
        );
        for (const r of recaps) {
          for (const p of r.pending) {
            io.log(`    ${r.packName} v${p.version} — ${p.note}`);
          }
          if (r.purchaseUrl) io.log(`    → renew at ${r.purchaseUrl}`);
        }
      }
      io.log("");
    }
    return 0;
  } catch (err) {
    io.error(
      `Failed to read license store: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}

async function runRemove(
  id: string | undefined,
  io: LicenseCommandIo
): Promise<number> {
  if (!id) {
    io.error("Missing license id. Usage: relay license remove <license-id>");
    return 1;
  }
  try {
    const { removeLicense } = await import("./store");
    if (!removeLicense(id, { dir: io.dir })) {
      io.log(`License not found: ${id} (nothing removed).`);
      return 0;
    }
    io.log(`Removed license ${id}.`);
    io.log(
      "Installed packs stay installed — a removed or expired license never " +
        "re-locks content you already have (it only gates new premium installs)."
    );
    return 0;
  } catch (err) {
    io.error(
      `Failed to remove license: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}
