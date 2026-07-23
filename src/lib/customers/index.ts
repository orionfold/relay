import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { customers, type CustomerRow } from "@/lib/db/schema";

/**
 * Slugify a display name into a stable, pack-addressable handle.
 * Mirrors the import format-adapter's slugify (lowercase, non-alnum → '-',
 * collapse, trim, cap 64) — kept local because the customer slug is an
 * independent concern (DRY-with-judgment: extract a shared util on a third use).
 */
export function slugifyCustomer(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export interface EnsureCustomerInput {
  /** Stable handle. Derived from `name` via slugifyCustomer when omitted. */
  slug?: string;
  name: string;
  industry?: string | null;
  notes?: string | null;
  status?: "active" | "archived";
  /** Internal pack-install provenance. Public customer APIs do not accept this. */
  sampleSource?: string;
}

export interface EnsureCustomerResult {
  customer: CustomerRow;
  created: boolean;
}

/**
 * Slug-idempotent create-if-absent for a customer. This is the seam the pack
 * installer (relay-pack-format) and the /api/customers route both call, so a
 * re-run of a pack seed never duplicates a customer.
 *
 * Semantics: create-if-absent, NOT upsert-all-fields — a second call with the
 * same slug returns the existing row untouched (re-seeding must not clobber edits
 * the operator made to a seeded customer). See _SPECS/2026-06-30-132039_customer-dimension.md.
 */
export async function ensureCustomer(
  input: EnsureCustomerInput
): Promise<EnsureCustomerResult> {
  const slug = (input.slug?.trim() || slugifyCustomer(input.name)).slice(0, 64);
  if (!slug) {
    throw new CustomerSlugError(input.name);
  }

  const existing = await db
    .select()
    .from(customers)
    .where(eq(customers.slug, slug))
    .get();
  if (existing) {
    return { customer: existing, created: false };
  }

  const now = new Date();
  const row: CustomerRow = {
    id: crypto.randomUUID(),
    name: input.name,
    slug,
    status: input.status ?? "active",
    industry: input.industry ?? null,
    notes: input.notes ?? null,
    sampleSource: input.sampleSource ?? null,
    sampleState: input.sampleSource ? "sample" : null,
    sampleSeedHash: input.sampleSource
      ? hashCustomerSeed({
          name: input.name,
          slug,
          status: input.status ?? "active",
          industry: input.industry ?? null,
          notes: input.notes ?? null,
        })
      : null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(customers).values(row);
  return { customer: row, created: true };
}

/** Thrown when a customer name cannot produce a usable slug (e.g. all punctuation). */
export class CustomerSlugError extends Error {
  constructor(name: string) {
    super(`Cannot derive a customer slug from name: ${JSON.stringify(name)}`);
    this.name = "CustomerSlugError";
  }
}

export function hashCustomerSeed(input: {
  name: string;
  slug: string;
  status: "active" | "archived";
  industry: string | null;
  notes: string | null;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}
