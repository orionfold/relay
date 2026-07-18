import { RelayHostError } from "./errors";
import { z } from "zod";
import { assertContentFree } from "./policy";

const ProviderRefSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
const HostBootstrapPlanSchema = z.object({
  providerKind: ProviderRefSchema,
  regionRef: ProviderRefSchema,
  sizeRef: ProviderRefSchema,
  hostLabel: ProviderRefSchema,
}).strict();
const HostBootstrapReceiptSchema = z.object({
  providerKind: ProviderRefSchema,
  providerHostRef: ProviderRefSchema,
  state: z.enum(["ready", "failed", "destroyed"]),
  reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,100}$/),
}).strict();

export type HostBootstrapPlan = {
  providerKind: string;
  regionRef: string;
  sizeRef: string;
  hostLabel: string;
};

export type HostBootstrapReceipt = {
  providerKind: string;
  providerHostRef: string;
  state: "ready" | "failed" | "destroyed";
  reasonCode: string;
};

export interface HostBootstrapProvider {
  readonly kind: string;
  provision(plan: HostBootstrapPlan, authorization: string): HostBootstrapReceipt;
  destroy(providerHostRef: string, authorization: string): HostBootstrapReceipt;
}

export class FakeHostBootstrapProvider implements HostBootstrapProvider {
  readonly kind = "fake";
  private sequence = 0;

  provision(plan: HostBootstrapPlan, authorization: string): HostBootstrapReceipt {
    if (!authorization) {
      throw new RelayHostError(
        "HOST_PROVIDER_AUTHORIZATION_REQUIRED",
        "Provider authorization is required in memory for Host provisioning.",
      );
    }
    const parsedPlan = HostBootstrapPlanSchema.safeParse(plan);
    if (!parsedPlan.success) {
      throw new RelayHostError(
        "HOST_PROVIDER_PLAN_INVALID",
        "Relay Host provider plan contains an invalid or content-bearing reference.",
      );
    }
    assertContentFree(parsedPlan.data);
    this.sequence += 1;
    return HostBootstrapReceiptSchema.parse({
      providerKind: this.kind,
      providerHostRef: `fake-host-${this.sequence}-${parsedPlan.data.hostLabel}`,
      state: "ready",
      reasonCode: "HOST_PROVIDER_READY",
    });
  }

  destroy(providerHostRef: string, authorization: string): HostBootstrapReceipt {
    if (!authorization) {
      throw new RelayHostError(
        "HOST_PROVIDER_AUTHORIZATION_REQUIRED",
        "Provider authorization is required in memory for Host cleanup.",
      );
    }
    const parsedRef = ProviderRefSchema.safeParse(providerHostRef);
    if (!parsedRef.success) {
      throw new RelayHostError(
        "HOST_PROVIDER_REF_INVALID",
        "Relay Host provider resource reference is invalid.",
      );
    }
    return HostBootstrapReceiptSchema.parse({
      providerKind: this.kind,
      providerHostRef: parsedRef.data,
      state: "destroyed",
      reasonCode: "HOST_PROVIDER_DESTROYED",
    });
  }
}
