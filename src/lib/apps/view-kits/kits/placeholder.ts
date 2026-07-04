import yaml from "js-yaml";
import { ManifestPaneBody } from "@/components/apps/kit-view/manifest-pane-body";
import { resolveBindings, type ResolvedBindings } from "../resolve";
import type {
  KitDefinition,
  KitProjection,
  ResolveInput,
  RuntimeState,
  ViewModel,
} from "../types";
import { headerStatus } from "../header-status";

/**
 * Phase 1.1 placeholder kit. Lands the seam: every app dispatches through
 * here until Phase 1.2 wires the real `pickKit` decision table and Phase 2+
 * populates the registry with domain-aware kits. The visible body stays
 * intentionally minimal — the previous composition view moves into the
 * "View manifest ▾" sheet (the `footer` slot).
 */

interface PlaceholderProjection extends KitProjection {
  bindings: ResolvedBindings;
  manifestYaml: string;
}

export const placeholderKit: KitDefinition = {
  id: "placeholder",

  resolve(input: ResolveInput): KitProjection {
    const projection: PlaceholderProjection = {
      bindings: resolveBindings(input.manifest),
      manifestYaml: yaml.dump(input.manifest, { lineWidth: 100 }),
    };
    return projection;
  },

  buildModel(proj: KitProjection, runtime: RuntimeState): ViewModel {
    const projection = proj as PlaceholderProjection;
    const { app } = runtime;

    return {
      header: {
        title: app.name,
        description: app.description ?? "Composed app",
        status: headerStatus(runtime),
      },
      footer: {
        appId: app.id,
        appName: app.name,
        manifestYaml: projection.manifestYaml,
        body: ManifestPaneBody({
          manifest: app.manifest,
          files: app.files,
          manifestYaml: projection.manifestYaml,
        }),
      },
    };
  },
};
