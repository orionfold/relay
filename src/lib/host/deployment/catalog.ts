import type { HostCapacity } from "@/lib/host/supervisor/contracts";
import type {
  HostDeploymentDraft,
  HostDeploymentEstimate,
} from "./contracts";

export const HOST_PRICE_SOURCE_DATE = "2026-07-16";
export const HOST_PRICE_SOURCE_URL = "https://www.digitalocean.com/pricing/droplets";

const GIB = 1024 ** 3;

const PLANS = {
  "basic-2gib-1vcpu": { memoryGiB: 2, vcpu: 1, monthly: 12 },
  "basic-4gib-2vcpu": { memoryGiB: 4, vcpu: 2, monthly: 24 },
  "basic-8gib-4vcpu": { memoryGiB: 8, vcpu: 4, monthly: 48 },
  "basic-16gib-8vcpu": { memoryGiB: 16, vcpu: 8, monthly: 96 },
} as const;

export function hostCapacityForDraft(draft: HostDeploymentDraft): HostCapacity {
  const plan = PLANS[draft.sizeRef];
  return {
    cpuMillis: plan.vcpu * 1000,
    memoryBytes: plan.memoryGiB * GIB,
    storageBytes: Math.max(25, plan.memoryGiB * 12) * GIB,
    reservePercent: 20,
  };
}

export function estimateHostDeployment(draft: HostDeploymentDraft): HostDeploymentEstimate {
  const plan = PLANS[draft.sizeRef];
  const memoryAdmission = Math.max(1, Math.floor((plan.memoryGiB * 0.9 - 0.5) / 1));
  const cpuAdmission = plan.vcpu * 3;
  const admittedCellsPerHost = Math.max(1, Math.min(memoryAdmission, cpuAdmission));
  const hostCount = Math.max(1, Math.ceil(draft.desiredCells / admittedCellsPerHost));
  if (draft.placement === "local") {
    return {
      sourceDate: HOST_PRICE_SOURCE_DATE,
      sourceUrl: HOST_PRICE_SOURCE_URL,
      currency: "USD",
      hostCount,
      admittedCellsPerHost,
      requestedCells: draft.desiredCells,
      reservePercent: 20,
      monthlyLow: 0,
      monthlyHigh: 0,
      provisional: true,
      exclusions: [
        "existing device, electricity, internet and operator labor",
        "BYOK model/API or private-runtime cost",
        "off-device recovery storage",
      ],
    };
  }
  const backup = draft.backupProfile === "weekly_provider" ? 0.2 : 0;
  const base = hostCount * plan.monthly * (1 + backup);
  return {
    sourceDate: HOST_PRICE_SOURCE_DATE,
    sourceUrl: HOST_PRICE_SOURCE_URL,
    currency: "USD",
    hostCount,
    admittedCellsPerHost,
    requestedCells: draft.desiredCells,
    reservePercent: 20,
    monthlyLow: Number(base.toFixed(2)),
    monthlyHigh: Number((base * 1.25).toFixed(2)),
    provisional: true,
    exclusions: [
      "BYOK model/API or private-runtime/GPU charges",
      "egress, tax, support and operator labor",
      "storage beyond the selected provider backup",
    ],
  };
}
