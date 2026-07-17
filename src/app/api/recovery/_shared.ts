import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { basename, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { RelayRecoveryError } from "@/lib/recovery/errors";
import { ZodError } from "zod";

export function recoveryApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "RECOVERY_INPUT_INVALID", detail: error.issues[0]?.message }, { status: 400 });
  }
  if (error instanceof RelayRecoveryError) {
    return NextResponse.json({ error: error.code, detail: error.message }, { status: error.status });
  }
  console.error("[recovery] API operation failed", error);
  return NextResponse.json({ error: "RECOVERY_INTERNAL_ERROR" }, { status: 500 });
}

export function configuredRecovery(): { destination: string; keyFile: string } {
  const destination = process.env.RELAY_RECOVERY_DESTINATION;
  const keyFile = process.env.RELAY_RECOVERY_KEY_FILE;
  if (!destination) throw new RelayRecoveryError("RECOVERY_DESTINATION_REQUIRED", "Recovery destination is not configured.", 409);
  if (!keyFile) throw new RelayRecoveryError("RECOVERY_KEY_REQUIRED", "Recovery key is not configured.", 409);
  return { destination: resolve(destination), keyFile: resolve(keyFile) };
}

export function recoveryJson(request: NextRequest): Promise<unknown> {
  return request.json().catch((error) => {
    throw new RelayRecoveryError("RECOVERY_JSON_INVALID", "Request body must be valid JSON.", 400, { cause: error });
  });
}

export function configuredBundle(bundleFile: unknown): { bundlePath: string; keyFile: string } {
  if (typeof bundleFile !== "string" || basename(bundleFile) !== bundleFile || !bundleFile.endsWith(".relay-recovery")) {
    throw new RelayRecoveryError("RECOVERY_BUNDLE_NAME_INVALID", "Choose a recovery bundle from Relay's configured destination.");
  }
  const config = configuredRecovery();
  const bundlePath = join(config.destination, bundleFile);
  if (!existsSync(bundlePath)) throw new RelayRecoveryError("RECOVERY_BUNDLE_NOT_FOUND", "Recovery bundle was not found.", 404);
  return { bundlePath, keyFile: config.keyFile };
}
