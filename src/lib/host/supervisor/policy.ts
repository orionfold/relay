import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  CellActualStateSchema,
  CellManifestSchema,
  type CellActualState,
  type CellManifest,
} from "./contracts";
import { RelayHostError } from "./errors";

const FORBIDDEN_KEYS = /(?:^|_)(?:password|credential|token|secret_value|prompt|message|document|model_response|customer_name|email)(?:$|_)/i;
const FORBIDDEN_VALUES = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i,
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/,
];

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sorted(child)]),
  );
}

export function canonicalHostJson(value: unknown): string {
  return JSON.stringify(sorted(value));
}

export function hostPlanDigest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalHostJson(value)).digest("hex")}`;
}

export function assertContentFree(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertContentFree(child, [...path, String(index)]));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && FORBIDDEN_VALUES.some((pattern) => pattern.test(value))) {
      throw new RelayHostError(
        "HOST_REGISTRY_CONTENT_REFUSED",
        `Host control record contains credential-shaped content at ${path.join(".") || "value"}.`,
      );
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.test(key) && key !== "secretRootRef") {
      throw new RelayHostError(
        "HOST_REGISTRY_CONTENT_REFUSED",
        `Host control record contains forbidden field ${[...path, key].join(".")}.`,
      );
    }
    assertContentFree(child, [...path, key]);
  }
}

export function parseCellManifest(value: unknown): CellManifest {
  const parsed = CellManifestSchema.safeParse(value);
  if (!parsed.success) {
    throw new RelayHostError(
      "HOST_MANIFEST_INVALID",
      `Relay Host Cell manifest is invalid: ${String(parsed.error.issues[0]?.message ?? "unknown error")}`,
    );
  }
  assertContentFree(parsed.data);
  return parsed.data;
}

export function assertPathInside(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const rel = relative(resolvedRoot, resolvedCandidate);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new RelayHostError(
      "HOST_RESOURCE_PATH_ESCAPE",
      "Cell resource path must be a descendant of the Relay Host root.",
    );
  }
  let existingRoot = resolvedRoot;
  try {
    existingRoot = realpathSync(resolvedRoot);
  } catch {
    // Creation validates again after the Host root exists.
  }
  let existingAncestor = resolvedCandidate;
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const existingCandidate = resolve(
    realpathSync(existingAncestor),
    relative(existingAncestor, resolvedCandidate),
  );
  const actualRel = relative(existingRoot, existingCandidate);
  if (actualRel === "" || actualRel.startsWith("..") || isAbsolute(actualRel)) {
    throw new RelayHostError(
      "HOST_RESOURCE_PATH_ESCAPE",
      "Cell resource path resolves outside the Relay Host root.",
    );
  }
  return resolvedCandidate;
}

const LEGAL_CELL_TRANSITIONS: Readonly<Record<CellActualState, readonly CellActualState[]>> = {
  absent: ["creating"],
  creating: ["stopped", "rolling_back", "partial", "error"],
  stopped: ["starting", "removing", "exporting", "purged", "error"],
  starting: ["running", "rolling_back", "partial", "error"],
  running: ["stopping", "restarting", "removing", "exporting", "purged", "error"],
  stopping: ["stopped", "partial", "error"],
  restarting: ["running", "partial", "error"],
  exporting: ["exported", "partial", "error"],
  removing: ["retained", "purged", "partial", "error"],
  rolling_back: ["absent", "stopped", "partial", "error"],
  retained: ["starting", "exporting", "purged", "error"],
  exported: ["purged"],
  purged: [],
  partial: ["rolling_back", "removing", "error"],
  error: ["rolling_back", "removing"],
  orphaned: ["rolling_back", "removing", "error"],
};

export function assertCellTransition(from: CellActualState, to: CellActualState): void {
  CellActualStateSchema.parse(from);
  CellActualStateSchema.parse(to);
  if (!LEGAL_CELL_TRANSITIONS[from].includes(to)) {
    throw new RelayHostError(
      "HOST_TRANSITION_ILLEGAL",
      `Illegal Relay Cell transition ${from} -> ${to}.`,
      { from, to },
    );
  }
}
