import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ainative-customers-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

async function loadModules() {
  const { db } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  const customersLib = await import("../index");
  return { db, ...schema, ...customersLib };
}

describe("ensureCustomer", () => {
  it("creates a customer when the slug is new", async () => {
    const { db, customers, ensureCustomer } = await loadModules();

    const result = await ensureCustomer({
      slug: "meridian-cre",
      name: "Meridian Commercial Realty",
      industry: "CRE",
    });

    expect(result.created).toBe(true);
    expect(result.customer.slug).toBe("meridian-cre");
    expect(result.customer.name).toBe("Meridian Commercial Realty");
    expect(result.customer.industry).toBe("CRE");
    expect(result.customer.status).toBe("active");

    const rows = await db.select().from(customers);
    expect(rows).toHaveLength(1);
  });

  it("is idempotent on slug — a second call returns the existing row, no duplicate", async () => {
    const { db, customers, ensureCustomer } = await loadModules();

    const first = await ensureCustomer({ slug: "acme", name: "Acme One" });
    const second = await ensureCustomer({ slug: "acme", name: "Acme Two (ignored)" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.customer.id).toBe(first.customer.id);
    // Name is NOT overwritten by a re-run — ensure is create-if-absent, not upsert-all-fields.
    expect(second.customer.name).toBe("Acme One");

    const rows = await db.select().from(customers);
    expect(rows).toHaveLength(1);
  });

  it("derives a slug from the name when none is supplied", async () => {
    const { ensureCustomer } = await loadModules();

    const result = await ensureCustomer({ name: "Summit CRE Advisors, LLC" });

    expect(result.created).toBe(true);
    expect(result.customer.slug).toBe("summit-cre-advisors-llc");
  });
});
