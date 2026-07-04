import type { HeaderSlot, RuntimeState } from "./types";

/**
 * BUG-2: derive the app header's status chip from real run state instead of a
 * hardcoded `"running"` literal. An app pulses "Running" ONLY while a task is
 * actually in flight; otherwise it reads a calm, non-pulsing "Ready".
 *
 * All 7 view-kit builders share this so the fake-green-pulse-on-idle defect
 * can't reappear in one kit. `activeRunCount` is populated once in the data
 * layer's `loadBaseline` and spread into every kit's RuntimeState.
 */
export function headerStatus(runtime: RuntimeState): HeaderSlot["status"] {
  return (runtime.activeRunCount ?? 0) > 0 ? "running" : "ready";
}
