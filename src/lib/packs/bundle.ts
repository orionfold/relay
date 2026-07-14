import { AppManifestSchema, type AppManifest } from "@/lib/apps/registry";
import {
  BundleCollisionError,
  type Pack,
  type ResolvedPack,
  type ResolvedPackFile,
} from "./format";

/**
 * Bundle-at-install (flatten) — the composition step (`pack-bundle-model`).
 *
 * `mergeBundle` takes a BUNDLE pack (which owns no inner manifest, only a child
 * list) plus its already-resolved children and merges them into ONE synthetic
 * `ResolvedPack`: one AppManifest (union of the children's primitives under the
 * bundle's identity) + one flattened file list. The install path then runs its
 * existing single-app flow ONCE over this result, so after install there is
 * exactly one app, one project scope, and every binding is intra-app — no live
 * cross-pack pointers and no silent 0-read risk (the whole reason for flatten).
 *
 * Pure + synchronous + no DB, no fs writes: it composes in-memory structures
 * whose file absPaths point straight into the children's on-disk dirs.
 *
 * COLLISIONS. Profile dirs and blueprint filenames are already pack-id-
 * namespaced (`relay-crm--x`, `relay-social--y`), so distinct children cannot
 * collide there. The real collision surface is the LOGICAL ids inside the
 * merged manifest — table/profile/blueprint/schedule ids — which are not
 * namespaced. A collision there means one child's primitive would silently
 * shadow another's, so we refuse the whole merge with a named
 * `BundleCollisionError` (Principle #1: no silent overwrite, no half-merge).
 * Seed files (`seed/**`) are CONSUMED, not dropped, so they are exempt from the
 * file-relPath collision guard — `seed/customers.yaml` legitimately appears
 * once per child and the install path's seed readers aggregate them.
 */

/** True for a droppable artifact (profiles/**, blueprints/**); false for consumed seeds. */
function isDroppableFile(relPath: string): boolean {
  return !relPath.startsWith("seed/");
}

/**
 * Assert the incoming child ids do not collide with any already-claimed id,
 * recording each into `claimed`. Throws BundleCollisionError naming the id, the
 * kind, and both owning packs (the prior owner + the current child).
 */
function claimIds(
  kind: string,
  childId: string,
  ids: string[],
  claimed: Map<string, string>
): void {
  for (const id of ids) {
    const key = `${kind}:${id}`;
    const prior = claimed.get(key);
    if (prior) {
      throw new BundleCollisionError(
        `Bundle merge collision: ${kind} id "${id}" is declared by both ` +
          `"${prior}" and "${childId}". Rename one before bundling — a bundle ` +
          `merges into ONE app, so the id must be unique across children.`
      );
    }
    claimed.set(key, childId);
  }
}

/**
 * Merge a bundle's resolved children into ONE synthetic ResolvedPack.
 *
 * @param bundlePack the parsed bundle pack (identity + entitlement source)
 * @param children   the children, resolved in `bundle:` order (order is
 *                   preserved in primitive concatenation and view merge)
 */
export function mergeBundle(
  bundlePack: Pack,
  children: ResolvedPack[]
): ResolvedPack {
  const meta = bundlePack.meta;

  // Track claimed logical ids per kind across children → loud collision.
  const claimed = new Map<string, string>();

  const profiles: AppManifest["profiles"] = [];
  const blueprints: AppManifest["blueprints"] = [];
  const tables: AppManifest["tables"] = [];
  const schedules: AppManifest["schedules"] = [];
  const budgetPolicies: AppManifest["budgetPolicies"] = [];

  // View merge accumulator (first-hero + concat-rest, in bundle order).
  let kit: string | undefined;
  let hero: unknown;
  const secondary: unknown[] = [];
  const kpis: unknown[] = [];
  const charts: unknown[] = [];
  const galleries: unknown[] = [];
  let cadence: unknown;
  let runs: unknown;
  let funnel: unknown;
  let generate: unknown;
  let publish: unknown;
  let hasView = false;

  // File merge: flatten every child's files; guard droppable relPaths only.
  const files: ResolvedPackFile[] = [];
  const seenDroppable = new Map<string, string>();

  for (const child of children) {
    const childId = child.pack.meta.id;
    const m = child.pack.manifest;

    claimIds("profile", childId, m.profiles.map((p) => p.id), claimed);
    claimIds("blueprint", childId, m.blueprints.map((b) => b.id), claimed);
    claimIds("table", childId, m.tables.map((t) => t.id), claimed);
    claimIds("schedule", childId, m.schedules.map((s) => s.id), claimed);
    claimIds(
      "budget policy",
      childId,
      m.budgetPolicies.map((policy) => policy.id),
      claimed
    );

    profiles.push(...m.profiles);
    blueprints.push(...m.blueprints);
    tables.push(...m.tables);
    schedules.push(...m.schedules);
    budgetPolicies.push(...m.budgetPolicies);

    // View: take kit + hero from the FIRST child that declares a view/hero;
    // concatenate secondary + kpis + charts + galleries across children in order. `funnel`,
    // `generate`, and `publish` are single-valued like hero — the first child to
    // declare one wins (a second funnel would fight for the analytics-header
    // slot; a bundle is one site so one generate/publish pair). Missing
    // `charts`/`galleries`/`funnel`/`generate`/`publish` here silently DROPS them from the
    // merged app — the same shadow-path class the KPI-ref rewrite guards against
    // — so every binding a child can declare must be carried through.
    if (m.view) {
      hasView = true;
      if (kit === undefined) kit = m.view.kit;
      const b = m.view.bindings ?? {};
      if (hero === undefined && b.hero !== undefined) hero = b.hero;
      if (cadence === undefined && b.cadence !== undefined) cadence = b.cadence;
      if (runs === undefined && b.runs !== undefined) runs = b.runs;
      if (funnel === undefined && b.funnel !== undefined) funnel = b.funnel;
      if (generate === undefined && b.generate !== undefined) generate = b.generate;
      if (publish === undefined && b.publish !== undefined) publish = b.publish;
      if (Array.isArray(b.secondary)) secondary.push(...b.secondary);
      if (Array.isArray(b.kpis)) kpis.push(...b.kpis);
      if (Array.isArray(b.charts)) charts.push(...b.charts);
      if (Array.isArray(b.galleries)) galleries.push(...b.galleries);
    }

    for (const file of child.files) {
      if (isDroppableFile(file.relPath)) {
        const prior = seenDroppable.get(file.relPath);
        if (prior) {
          throw new BundleCollisionError(
            `Bundle merge collision: file "${file.relPath}" is shipped by both ` +
              `"${prior}" and "${childId}". Two children cannot drop the same ` +
              `artifact path into one app.`
          );
        }
        seenDroppable.set(file.relPath, childId);
      }
      files.push(file);
    }
  }

  // Build the merged view only if at least one child had one.
  const bindings: Record<string, unknown> = {};
  if (hero !== undefined) bindings.hero = hero;
  if (secondary.length > 0) bindings.secondary = secondary;
  if (cadence !== undefined) bindings.cadence = cadence;
  if (runs !== undefined) bindings.runs = runs;
  if (kpis.length > 0) bindings.kpis = kpis;
  if (charts.length > 0) bindings.charts = charts;
  if (galleries.length > 0) bindings.galleries = galleries;
  if (funnel !== undefined) bindings.funnel = funnel;
  if (generate !== undefined) bindings.generate = generate;
  if (publish !== undefined) bindings.publish = publish;
  const view = hasView ? { kit: kit ?? "auto", bindings } : undefined;

  // Compose + validate the merged manifest against the strict schema. Identity
  // (id/name/version/description/entitlement) is the BUNDLE's — bundle id = app
  // id = project id, the one-string identity §2.
  const mergedManifest = AppManifestSchema.parse({
    id: meta.id,
    name: meta.name,
    ...(meta.version ? { version: meta.version } : {}),
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.entitlement ? { entitlement: meta.entitlement } : {}),
    profiles,
    blueprints,
    tables,
    schedules,
    budgetPolicies,
    ...(view ? { view } : {}),
  });

  const syntheticPack: Pack = {
    rootDir: bundlePack.rootDir,
    meta,
    manifest: mergedManifest,
  };

  return { pack: syntheticPack, files };
}
