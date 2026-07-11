import { z } from "zod";
import { defineTool } from "../tool-registry";
import { err, ok, type ToolContext } from "./helpers";

export function packTools(ctx: ToolContext) {
  return [
    defineTool(
      "export_app_as_pack",
      "Export a Relay-composed app as a portable pack directory (pack.yaml + base/) with no network access. Live table rows are excluded by default. Use after composing an app when the user asks to build/create a pack.",
      {
        appId: z.string().min(1).describe("Composed app id (kebab-case slug)"),
        author: z.string().min(1).max(120).optional(),
        includeSampleData: z
          .boolean()
          .default(false)
          .describe("Privacy-sensitive: include at most 25 current rows per table as seed data. Keep false unless the user explicitly asks to publish sample data."),
      },
      async (args) => {
        try {
          const { exportAppPackToDirectory } = await import("@/lib/packs/app-exporter");
          const result = await exportAppPackToDirectory(args.appId, args);
          const payload = {
            appId: args.appId,
            outputDir: result.outputDir,
            artifactHash: result.artifact.hash,
            version: result.artifact.version,
            fileCount: result.artifact.files.length,
            sampleRowsIncluded: result.artifact.sampleRowsIncluded,
            files: result.artifact.files.map((file) => file.path),
            message: "Portable Relay Pack exported locally. No network request was made.",
          };
          ctx.onToolResult?.("export_app_as_pack", payload);
          return ok(payload);
        } catch (error) {
          return err(error instanceof Error ? error.message : "Pack export failed");
        }
      }
    ),

    defineTool(
      "list_pack_publish_targets",
      "List configured private Git repository targets for an app. Credentials are always masked. Use before publish_app_as_pack; never ask the user to paste a GitHub token into chat.",
      { appId: z.string().min(1) },
      async (args) => {
        try {
          const { listPublishTargets } = await import("@/lib/publishers/app-publish");
          return ok(
            listPublishTargets(args.appId).filter(
              (target) => target.targetType === "github-repo"
            )
          );
        } catch (error) {
          return err(error instanceof Error ? error.message : "Pack targets could not be listed");
        }
      }
    ),

    defineTool(
      "publish_app_as_pack",
      "Export an app and publish it atomically to an already-configured private Git repository. Only call after the user explicitly asked to save/publish/push the pack. Requires confirm=true. Never collect repository credentials in chat; direct the user to the Pack repository panel when no target exists.",
      {
        appId: z.string().min(1),
        targetId: z.string().min(1).describe("A github-repo target id returned by list_pack_publish_targets"),
        confirm: z.literal(true).describe("Explicit publish confirmation derived from the user's current request"),
        author: z.string().min(1).max(120).optional(),
        includeSampleData: z
          .boolean()
          .default(false)
          .describe("Privacy-sensitive. Keep false unless the user explicitly asked to include sample rows."),
      },
      async (args) => {
        try {
          const { buildAppPackArtifact } = await import("@/lib/packs/app-exporter");
          const preview = await buildAppPackArtifact(args.appId, args);
          const { publishAppPackNow } = await import("@/lib/publishers/pack-publish");
          const deployment = await publishAppPackNow(args.appId, args.targetId, {
            ...args,
            expectedHash: preview.hash,
          });
          if (deployment.status !== "success") {
            return err(deployment.error ?? "Pack repository publish failed");
          }
          const payload = {
            appId: args.appId,
            deploymentId: deployment.id,
            repositoryUrl: deployment.url,
            commit: deployment.commit,
            artifactHash: deployment.artifactHash,
            message: "Relay Pack published to the configured repository.",
          };
          ctx.onToolResult?.("publish_app_as_pack", payload);
          return ok(payload);
        } catch (error) {
          return err(error instanceof Error ? error.message : "Pack repository publish failed");
        }
      }
    ),
  ];
}
