import { extractAppIdFromArtifactId } from "./composition-detector";
import { parseAppScheduleId } from "./app-schedule-id";

/**
 * Primitive → pack source-of-truth resolver (spec:
 * features/fix-app-shell-activation-redesign.md → "Grooming decision (S40)").
 *
 * The pack that installed a primitive is NOT recorded as a first-class field —
 * it is encoded by convention, differently per kind:
 *
 *   - profiles / blueprints : the `<packId>--<name>` id prefix (file-dropped
 *     verbatim from the pack manifest, where `prefix === pack.meta.id`).
 *   - tables                : `projectId === pack.meta.id` (a DB column set at
 *     install; the id itself is a fresh UUID).
 *   - schedules             : the `app:<packId>:<sid>` composite id (most
 *     specific) AND `projectId === pack.meta.id`.
 *
 * This resolver unifies those signals behind ONE function so the four listing
 * views (FEAT-7 filter) and the provenance pill (FEAT-8) never branch on a raw
 * id shape, and so the pack-aware seed gate (BUG-6) has a single question to
 * ask. Chosen over adding a persisted `packId` field because the prefix already
 * encodes provenance while the pack is installed. Pack removal deliberately
 * retains these primitives; the installed-set gate then stops presenting them
 * as owned by a pack that is no longer installed (Principles #5/#7).
 *
 * PURE by design: the installed-pack set is passed in, never read here. That
 * keeps the resolver testable without a filesystem/DB and usable both in a
 * server component (pass `new Set(listApps().map(a => a.id))`) and client-side
 * (pass a prefetched set). No I/O, no runtime-registry-adjacent imports.
 *
 * The installed-set gate is the whole point: a `--` id or a `projectId` alone
 * is ambiguous — a user's hand-authored `my-notes--triage` profile or a normal
 * project must NOT be mis-attributed to a pack. A candidate pack id is only
 * returned when it is a member of the installed set.
 */

export type PackableKind = "profile" | "blueprint" | "table" | "schedule";

export interface PackablePrimitive {
  kind: PackableKind;
  /** The primitive's id: `<pack>--<name>` (files), a UUID (tables), or `app:<pack>:<sid>` (schedules). */
  id: string;
  /** DB column for tables/schedules; equals the pack id when pack-installed. Absent on file kinds. */
  projectId?: string | null;
}

/**
 * Resolve the id of the pack that installed `primitive`, or `null` when it is
 * not attributable to any installed pack. `installedPackIds` is the gate — a
 * candidate is returned only if it is a member.
 */
export function packOf(
  primitive: PackablePrimitive,
  installedPackIds: ReadonlySet<string>
): string | null {
  const candidate = candidatePackId(primitive);
  if (candidate && installedPackIds.has(candidate)) return candidate;
  return null;
}

/**
 * The best pack-id candidate from the primitive's own signals, BEFORE the
 * installed-set gate. Order per kind is deliberate: the most specific,
 * least-mutable signal wins (schedules prefer the composite id over the
 * user-reassignable projectId).
 */
function candidatePackId(primitive: PackablePrimitive): string | null {
  switch (primitive.kind) {
    case "profile":
    case "blueprint":
      return extractAppIdFromArtifactId(primitive.id);
    case "table":
      return normalizeProjectId(primitive.projectId);
    case "schedule": {
      const fromId = parseAppScheduleId(primitive.id)?.appId ?? null;
      return fromId ?? normalizeProjectId(primitive.projectId);
    }
  }
}

function normalizeProjectId(projectId: string | null | undefined): string | null {
  return projectId && projectId.length > 0 ? projectId : null;
}
