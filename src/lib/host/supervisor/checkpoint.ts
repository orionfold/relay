import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { recoveryReceiptSchema } from "@/lib/recovery/types";
import { RelayHostError } from "./errors";

export type HostCheckpointEvidence = {
  cellId: string;
  checkpointRef: string;
  receiptPath: string;
  bundlePath: string;
};

export interface HostCheckpointVerifier {
  verify(evidence: HostCheckpointEvidence): void;
}

function sha256File(path: string): string {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = openSync(path, "r");
  try {
    let bytesRead = 0;
    do {
      bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

export class FileHostCheckpointVerifier implements HostCheckpointVerifier {
  verify(evidence: HostCheckpointEvidence): void {
    let receiptValue: unknown;
    try {
      receiptValue = JSON.parse(readFileSync(resolve(evidence.receiptPath), "utf8"));
    } catch (error) {
      throw new RelayHostError(
        "HOST_CHECKPOINT_RECEIPT_UNREADABLE",
        "Relay Host could not read the recovery verification receipt.",
        undefined,
        { cause: error },
      );
    }
    const parsed = recoveryReceiptSchema.safeParse(receiptValue);
    if (!parsed.success) {
      throw new RelayHostError(
        "HOST_CHECKPOINT_RECEIPT_INVALID",
        "Relay Host recovery verification receipt is invalid.",
      );
    }
    const receipt = parsed.data;
    if (
      !["verify", "drill"].includes(receipt.operation) ||
      receipt.status !== "verified" ||
      receipt.cellId !== evidence.cellId ||
      receipt.bundleSha256 === null ||
      evidence.checkpointRef !== `sha256:${receipt.bundleSha256}`
    ) {
      throw new RelayHostError(
        "HOST_CHECKPOINT_NOT_VERIFIED",
        `Recovery evidence does not verify checkpoint continuity for Relay Cell ${evidence.cellId}.`,
      );
    }
    const bundlePath = resolve(evidence.bundlePath);
    let actualDigest: string;
    try {
      if (!statSync(bundlePath).isFile() || basename(bundlePath) !== receipt.bundleFile) {
        throw new Error("bundle identity mismatch");
      }
      actualDigest = sha256File(bundlePath);
    } catch (error) {
      throw new RelayHostError(
        "HOST_CHECKPOINT_BUNDLE_UNREADABLE",
        "Relay Host could not read the exact recovery bundle named by the verification receipt.",
        undefined,
        { cause: error },
      );
    }
    if (actualDigest !== receipt.bundleSha256) {
      throw new RelayHostError(
        "HOST_CHECKPOINT_DIGEST_MISMATCH",
        "Relay Host recovery bundle no longer matches its verification receipt.",
      );
    }
  }
}
