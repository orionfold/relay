import { z } from "zod";
import { relayProductVersion } from "@/lib/config/version";
import { RelayHostError } from "@/lib/host/supervisor/errors";
import release from "./relay-cell-release.json";

const RelayCellReleaseSchema = z.object({
  schema: z.literal("orionfold.relay-cell-release/v1"),
  relayVersion: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  imageRepository: z.literal("ghcr.io/orionfold/relay-cell"),
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  publishedAt: z.string().datetime(),
  sourceTag: z.string().regex(/^cell-v\d+\.\d+\.\d+$/),
}).strict();

export type RelayCellRelease = z.infer<typeof RelayCellReleaseSchema>;

export function currentRelayCellRelease(): RelayCellRelease {
  const parsed = RelayCellReleaseSchema.safeParse(release);
  if (!parsed.success) {
    throw new RelayHostError(
      "HOST_ARTIFACT_RELEASE_INVALID",
      "The bundled Relay Cell release authority is invalid.",
    );
  }
  const productVersion = relayProductVersion();
  if (parsed.data.relayVersion !== productVersion) {
    throw new RelayHostError(
      "HOST_ARTIFACT_RELEASE_MISMATCH",
      `Relay ${productVersion} has no matching published Cell release authority. Managed Cell expansion is unavailable until the release manifest is updated.`,
    );
  }
  return parsed.data;
}
