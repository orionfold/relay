import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";
import type { RuntimeRoutingStatus } from "./runtime-routing-status";

export type RuntimeReadinessSummaryState =
  | "ready"
  | "degraded"
  | "setup-needed";

export interface RuntimeReadinessSummary {
  state: RuntimeReadinessSummaryState;
  label: string;
  detail: string;
  readyRuntimeLabels: string[];
  attentionRuntimeLabels: string[];
}

/**
 * Provider-neutral shell summary for the exact runtime pool selected by the
 * routing policy. Unconfigured entries in the default pool do not degrade a
 * healthy configured runtime; configured-but-unready entries do.
 */
export function summarizeRuntimeReadiness(
  statuses: RuntimeRoutingStatus[],
  eligibleRuntimeIds: AgentRuntimeId[],
): RuntimeReadinessSummary {
  const byId = new Map(statuses.map((status) => [status.runtimeId, status]));
  const eligible = eligibleRuntimeIds.flatMap((runtimeId) => {
    const status = byId.get(runtimeId);
    return status ? [status] : [];
  });
  const configured = eligible.filter((status) => status.configured);
  const ready = configured.filter((status) => status.ready);
  const attention = configured.filter((status) => !status.ready);
  const readyRuntimeLabels = ready.map((status) => status.label);
  const attentionRuntimeLabels = attention.map((status) => status.label);

  if (configured.length === 0) {
    return {
      state: "setup-needed",
      label: "Setup needed",
      detail: "Configure an eligible runtime to run Relay work.",
      readyRuntimeLabels,
      attentionRuntimeLabels,
    };
  }

  if (attention.length === 0) {
    const label =
      ready.length === 1
        ? `${ready[0].label} ready`
        : `${ready.length} runtimes ready`;
    return {
      state: "ready",
      label,
      detail:
        ready.length === 1
          ? `${ready[0].label} is verified and eligible for routed work.`
          : `${readyRuntimeLabels.join(", ")} are verified and eligible for routed work.`,
      readyRuntimeLabels,
      attentionRuntimeLabels,
    };
  }

  if (ready.length > 0) {
    return {
      state: "degraded",
      label: `${ready[0].label} ready · fallback limited`,
      detail: `${readyRuntimeLabels.join(", ")} ${
        ready.length === 1 ? "is" : "are"
      } ready. ${attentionRuntimeLabels.join(", ")} ${
        attention.length === 1 ? "needs" : "need"
      } attention.`,
      readyRuntimeLabels,
      attentionRuntimeLabels,
    };
  }

  return {
    state: "degraded",
    label:
      attention.length === 1
        ? `${attention[0].label} unavailable`
        : "Runtimes unavailable",
    detail: `${attentionRuntimeLabels.join(", ")} ${
      attention.length === 1 ? "is" : "are"
    } configured but not ready.`,
    readyRuntimeLabels,
    attentionRuntimeLabels,
  };
}
