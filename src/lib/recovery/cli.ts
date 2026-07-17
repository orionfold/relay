import { createRecoveryKeyFile } from "./key";
import {
  createRecoveryBundle,
  drillRecoveryBundle,
  enforceRecoveryRetention,
  recoveryStatus,
  restoreRecoveryBundle,
  verifyRecoveryBundle,
} from "./orchestrator";
import { RelayRecoveryError } from "./errors";

type Output = { log(message: string): void; error(message: string): void };

function flag(argv: string[], name: string): string | undefined {
  const long = `--${name}`;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === long) return argv[index + 1];
    if (argv[index].startsWith(`${long}=`)) return argv[index].slice(long.length + 1);
  }
  return undefined;
}

function required(argv: string[], name: string): string {
  const value = flag(argv, name);
  if (!value) throw new RelayRecoveryError("RECOVERY_CLI_ARGUMENT_REQUIRED", `Missing required --${name}.`);
  return value;
}

function printReceipt(output: Output, receipt: { status: string; reasonCode: string; bundleFile: string; durationMs: number }): void {
  output.log(`Status: ${receipt.status}`);
  output.log(`Reason: ${receipt.reasonCode}`);
  output.log(`Bundle: ${receipt.bundleFile}`);
  output.log(`Duration: ${receipt.durationMs}ms`);
}

export async function runRecoveryCommand(argv: string[], output: Output): Promise<number> {
  try {
    const action = argv[0];
    if (action === "key" && argv[1] === "create") {
      const result = createRecoveryKeyFile(required(argv.slice(2), "out"));
      output.log(`Recovery key created at ${result.path}`);
      output.log(`Fingerprint: ${result.fingerprint}`);
      output.log("Keep this key separate from the Relay Cell and recovery bundles. Orionfold cannot recover it.");
      return 0;
    }
    if (action === "create") {
      const result = await createRecoveryBundle({
        destination: required(argv.slice(1), "destination"),
        keyFile: required(argv.slice(1), "key-file"),
        cellId: flag(argv.slice(1), "cell-id"),
      });
      printReceipt(output, result.receipt);
      output.log(`Published: ${result.bundlePath}`);
      return 0;
    }
    if (action === "verify" || action === "drill") {
      const args = {
        bundlePath: required(argv.slice(1), "bundle"),
        keyFile: required(argv.slice(1), "key-file"),
        cellId: flag(argv.slice(1), "cell-id"),
      };
      const receipt = action === "verify" ? await verifyRecoveryBundle(args) : await drillRecoveryBundle(args);
      printReceipt(output, receipt);
      return 0;
    }
    if (action === "restore") {
      const receipt = await restoreRecoveryBundle({
        bundlePath: required(argv.slice(1), "bundle"),
        keyFile: required(argv.slice(1), "key-file"),
        targetDataDir: required(argv.slice(1), "target-data-dir"),
        cellId: flag(argv.slice(1), "cell-id"),
      });
      printReceipt(output, receipt);
      output.log("Restore installed into an empty data root. Start Relay with --data-dir pointing to that root.");
      return 0;
    }
    if (action === "status") {
      const status = recoveryStatus();
      output.log(`Destination configured: ${status.destinationConfigured ? "yes" : "no"} (${status.destinationSource})`);
      output.log(`Recovery key configured: ${status.keyConfigured ? "yes" : "no"} (${status.keySource})`);
      output.log(`Latest receipt: ${status.latest ? `${status.latest.status} ${status.latest.reasonCode}` : "none"}`);
      return 0;
    }
    if (action === "prune") {
      const countText = flag(argv.slice(1), "max-count");
      const ageText = flag(argv.slice(1), "max-age-days");
      if (!countText && !ageText) throw new RelayRecoveryError("RECOVERY_RETENTION_REQUIRED", "Prune requires --max-count and/or --max-age-days.");
      const deleted = enforceRecoveryRetention({
        destination: required(argv.slice(1), "destination"),
        cellId: required(argv.slice(1), "cell-id"),
        maxCount: countText ? Number.parseInt(countText, 10) : undefined,
        maxAgeDays: ageText ? Number.parseInt(ageText, 10) : undefined,
      });
      output.log(`Deleted ${deleted} recovery bundle(s).`);
      return 0;
    }
    output.error(`Unknown recovery action: ${action ?? "(none)"}`);
    output.error("Available actions: key create, create, verify, drill, restore, status, prune");
    return 1;
  } catch (error) {
    const named = error instanceof RelayRecoveryError ? error : new RelayRecoveryError("RECOVERY_CLI_FAILED", "Recovery command failed.", 500, { cause: error });
    output.error(`${named.code}: ${named.message}`);
    return 1;
  }
}
