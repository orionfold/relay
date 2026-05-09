import { createHash } from "node:crypto";

/**
 * Canonicalizes a row's JSON data into a stable string for hashing.
 *
 * Walks `columnNames` in order so the output JSON has a deterministic key
 * sequence regardless of the input map's iteration order. Null/undefined/
 * missing keys all become the empty string — see F10 design (decision 2)
 * for why empty-string is the canonical empty.
 *
 * Keys not in `columnNames` are dropped: a row may carry residue from a
 * prior schema (renamed/deleted column) and that residue must NOT
 * participate in dedupe identity.
 */
export function canonicalizeRowForHash(
  data: Record<string, unknown>,
  columnNames: string[]
): string {
  const canonical: Record<string, string> = {};
  for (const name of columnNames) {
    const v = data[name];
    canonical[name] = v === null || v === undefined ? "" : String(v);
  }
  return JSON.stringify(canonical);
}

/**
 * SHA-256 hex digest of the canonicalized row. Used as the dedupe key in
 * the partial UNIQUE INDEX on `user_table_rows(table_id, data_hash)`.
 *
 * No collisions practically possible for any realistic row volume; SHA-256
 * is overkill but cheap and avoids any "is this hash safe" debate.
 */
export function hashRowData(
  data: Record<string, unknown>,
  columnNames: string[]
): string {
  return createHash("sha256")
    .update(canonicalizeRowForHash(data, columnNames))
    .digest("hex");
}
