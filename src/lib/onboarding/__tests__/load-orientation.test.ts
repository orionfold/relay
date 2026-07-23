import { describe, expect, it, vi } from "vitest";
import { loadCustomerOrientation } from "../load-orientation";

describe("loadCustomerOrientation", () => {
  it("surfaces a bundled Pack catalog read failure instead of inferring Agency is absent", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = loadCustomerOrientation({
      loadLicenses: () => [],
      loadInstalledPackIds: () => [],
      isAgencyBundled: () => {
        throw new Error("catalog unreadable");
      },
      loadHost: () => ({ licenseStatus: "missing" }),
    });

    expect(result.packs).toMatchObject({
      agency: "unavailable",
      readError: "Bundled Pack catalog: catalog unreadable",
    });
    expect(result.primaryAction.kind).not.toBe("install_pack");
  });
});
