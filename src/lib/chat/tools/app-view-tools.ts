import { defineTool } from "../tool-registry";
import { APPS_CHANGED_EVENT } from "@/lib/apps/apps-events";
import { ok, err, type ToolContext } from "./helpers";
import {
  KitIdSchema,
  KpiSpecSchema,
  ViewSchema,
  getApp,
  writeAppManifest,
  type AppManifest,
} from "@/lib/apps/registry";
import { z } from "zod";

/**
 * Three chat tools for power users who want explicit control over a
 * composed app's `view:` field. Auto-inference handles the default case;
 * these tools let an LLM override or augment that decision via chat.
 *
 * All three:
 *   1. Load the current manifest via `getApp(appId)`.
 *   2. Deep-clone the manifest, mutate `view`, and validate the result
 *      against the strict `ViewSchema` (rejecting LLM-hallucinated kit
 *      ids, KPI source kinds, or binding shapes).
 *   3. Atomically write the manifest via `writeAppManifest` (temp-file +
 *      rename so a mid-write failure cannot corrupt the file).
 *   4. Fire `relay-apps-changed` so `useApps()` and the dispatcher
 *      pick up the new layout immediately.
 *   5. Return the new effective view so the LLM can confirm to the user.
 *
 * Mutations preserve any unrelated `view:` fields (e.g. setting kit only
 * does not clear bindings or kpis). This matches the principle of
 * least-surprise for incremental edits.
 */

// Pull the bindings sub-schema directly off ViewSchema per the spec —
// keeps the tool's input shape in lock-step with the strict schema so a
// future schema rotation does not require a duplicate edit here.
const BindingsSchema = ViewSchema.shape.bindings;

function dispatchAppsChangedFromTool(): void {
  // Server-side handler — `window` is undefined under Node. The browser
  // also re-fetches via `useApps()` listening to the same event when it
  // observes a manifest mutation through the cache invalidation, but a
  // best-effort dispatch here helps when the tool runs in a context that
  // does have window (e.g. integration tests under jsdom).
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(APPS_CHANGED_EVENT));
  }
}

function loadManifestOrError(appId: string):
  | { ok: true; manifest: AppManifest }
  | { ok: false; error: string } {
  const app = getApp(appId);
  if (!app) {
    return {
      ok: false,
      error: `App not found: ${appId}`,
    };
  }
  // Deep-clone so the in-memory cache copy is not mutated before the
  // schema validation step decides whether to commit.
  return {
    ok: true,
    manifest: JSON.parse(JSON.stringify(app.manifest)) as AppManifest,
  };
}

export function appViewTools(_ctx: ToolContext) {
  return [
    defineTool(
      "set_app_view_kit",
      "Set the explicit view kit for a composed app. Pass 'auto' to revert to inference. Valid kits: auto, tracker, coach, inbox, research, ledger, workflow-hub.",
      {
        appId: z.string().min(1).describe("App id (e.g. 'habit-tracker')"),
        kit: KitIdSchema.describe(
          "View kit id. Use 'auto' to delegate to inference."
        ),
      },
      async (args) => {
        const loaded = loadManifestOrError(args.appId);
        if (!loaded.ok) return err(loaded.error);

        // ViewSchema has `kit.default("auto")` and `bindings.default({})`
        // — supply both explicitly so the inferred type lines up. Existing
        // bindings/hideManifestPane carry through unmodified.
        const currentView = loaded.manifest.view;
        const next: AppManifest = {
          ...loaded.manifest,
          view: {
            kit: args.kit,
            bindings: currentView?.bindings ?? {},
            hideManifestPane: currentView?.hideManifestPane ?? false,
          },
        };

        try {
          writeAppManifest(args.appId, next);
        } catch (e) {
          return err(
            e instanceof Error
              ? `Failed to write manifest: ${e.message}`
              : "Failed to write manifest"
          );
        }
        dispatchAppsChangedFromTool();
        return ok({
          appId: args.appId,
          kit: args.kit,
          message:
            args.kit === "auto"
              ? "View kit reverted to auto-inference"
              : `View kit set to '${args.kit}'`,
        });
      }
    ),

    defineTool(
      "set_app_view_bindings",
      "Set hero/secondary/cadence/runs/kpis bindings for a composed app's view. Bindings reference primitive ids (table, blueprint, schedule, profile) declared in the manifest. Replaces the entire bindings object — pass the complete desired state.",
      {
        appId: z.string().min(1).describe("App id (e.g. 'habit-tracker')"),
        bindings: BindingsSchema.describe(
          "Complete bindings object — { hero?, secondary?[], cadence?, runs?, kpis?[] } with each ref shaped { table | blueprint | schedule | profile: string }"
        ),
      },
      async (args) => {
        const loaded = loadManifestOrError(args.appId);
        if (!loaded.ok) return err(loaded.error);

        const currentView = loaded.manifest.view;
        const next: AppManifest = {
          ...loaded.manifest,
          view: {
            kit: currentView?.kit ?? "auto",
            bindings: args.bindings,
            hideManifestPane: currentView?.hideManifestPane ?? false,
          },
        };

        try {
          writeAppManifest(args.appId, next);
        } catch (e) {
          return err(
            e instanceof Error
              ? `Failed to write manifest: ${e.message}`
              : "Failed to write manifest"
          );
        }
        dispatchAppsChangedFromTool();
        return ok({
          appId: args.appId,
          bindings: args.bindings,
          message: "View bindings updated",
        });
      }
    ),

    defineTool(
      "set_app_view_kpis",
      "Declare 1-6 KPI tiles for a composed app's view. Each KPI has a discriminated source (tableCount, tableSum, tableLatest, blueprintRunCount, scheduleNextFire, tableSumWindowed). Replaces the entire kpis array.",
      {
        appId: z.string().min(1).describe("App id (e.g. 'finance-tracker')"),
        kpis: z
          .array(KpiSpecSchema)
          .min(1)
          .max(6)
          .describe(
            "Array of 1-6 KPI specs. Each: { id, label, source: { kind, ... }, format? }"
          ),
      },
      async (args) => {
        const loaded = loadManifestOrError(args.appId);
        if (!loaded.ok) return err(loaded.error);

        const currentView = loaded.manifest.view;
        const currentBindings = currentView?.bindings ?? {};
        const next: AppManifest = {
          ...loaded.manifest,
          view: {
            kit: currentView?.kit ?? "auto",
            bindings: {
              ...currentBindings,
              kpis: args.kpis,
            },
            hideManifestPane: currentView?.hideManifestPane ?? false,
          },
        };

        try {
          writeAppManifest(args.appId, next);
        } catch (e) {
          return err(
            e instanceof Error
              ? `Failed to write manifest: ${e.message}`
              : "Failed to write manifest"
          );
        }
        dispatchAppsChangedFromTool();
        return ok({
          appId: args.appId,
          kpis: args.kpis,
          message: `Set ${args.kpis.length} KPI tile${args.kpis.length === 1 ? "" : "s"}`,
        });
      }
    ),
  ];
}
