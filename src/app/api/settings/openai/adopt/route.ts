import { NextResponse } from "next/server";
import {
  adoptExistingCodexSession,
  CodexSessionAdoptionError,
} from "@/lib/settings/codex-session-adoption";

export async function POST() {
  try {
    const state = await adoptExistingCodexSession();
    const { clearRuntimeRoutingStatusCache } = await import(
      "@/lib/settings/runtime-routing-status"
    );
    clearRuntimeRoutingStatusCache();
    return NextResponse.json({
      connected: state.connected,
      account: state.account,
      rateLimits: state.rateLimits,
    });
  } catch (error) {
    const namedError = error instanceof CodexSessionAdoptionError;
    const status = namedError ? error.status : 500;
    return NextResponse.json(
      {
        connected: false,
        error: namedError
          ? error.message
          : "Relay could not adopt the existing Codex sign-in.",
      },
      { status },
    );
  }
}
