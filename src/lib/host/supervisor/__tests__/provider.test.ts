import { describe, expect, it } from "vitest";
import { FakeHostBootstrapProvider } from "../provider";

describe("Relay Host provider port", () => {
  it("consumes authorization in memory and returns content-free provider references", () => {
    const provider = new FakeHostBootstrapProvider();
    const receipt = provider.provision(
      { providerKind: "fake", regionRef: "region-a", sizeRef: "small", hostLabel: "host-a" },
      "ephemeral-provider-authorization",
    );
    expect(receipt).toMatchObject({ state: "ready", providerKind: "fake" });
    expect(JSON.stringify(receipt)).not.toContain("ephemeral-provider-authorization");
    expect(provider.destroy(receipt.providerHostRef, "ephemeral-provider-authorization")).toMatchObject({
      state: "destroyed",
      providerHostRef: receipt.providerHostRef,
    });
  });

  it("refuses provisioning without explicit authorization", () => {
    const provider = new FakeHostBootstrapProvider();
    expect(() => provider.provision(
      { providerKind: "fake", regionRef: "region-a", sizeRef: "small", hostLabel: "host-a" },
      "",
    )).toThrowError(/authorization is required in memory/);
  });

  it("refuses content-bearing provider plan references", () => {
    const provider = new FakeHostBootstrapProvider();
    expect(() => provider.provision(
      { providerKind: "fake", regionRef: "region-a", sizeRef: "small", hostLabel: "Customer A" },
      "ephemeral-provider-authorization",
    )).toThrowError(/invalid or content-bearing/);
  });
});
