/**
 * Publisher adapter types for the generator/publisher substrate (TDR-039).
 * Mirrors the ChannelAdapter pattern in src/lib/channels/types.ts.
 */

export interface PublisherAdapter {
  targetType: string;
  publish(artifact: Artifact, config: Record<string, unknown>): Promise<PublishResult>;
  testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }>;
}

export interface Artifact {
  files: ArtifactFile[];
  entryPoint: string;
  hash: string;
}

export interface ArtifactFile {
  path: string;
  content: string | Buffer;
}

export interface PublishResult {
  success: boolean;
  url?: string;
  finalUrl?: string;
  commit?: string;
  error?: string;
}

// ── Credential masking ───────────────────────────────────────────────

/** Fields in publish target config JSON that contain secrets and must be masked in API responses. */
const SENSITIVE_PUBLISH_KEYS = ["token", "githubToken", "apiKey"];

/**
 * Mask sensitive fields in a publish target config JSON string.
 * Returns a new JSON string with secrets replaced by "****<last4>".
 */
export function maskPublishConfig(configJson: string): string {
  try {
    const parsed = JSON.parse(configJson) as Record<string, unknown>;
    for (const key of SENSITIVE_PUBLISH_KEYS) {
      const val = parsed[key];
      if (typeof val === "string" && val.length > 0) {
        const last4 = val.slice(-4);
        parsed[key] = `****${last4}`;
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return configJson;
  }
}

/**
 * Mask sensitive fields in a publish target row before returning from API.
 */
export function maskPublishTarget<T extends { config: string }>(row: T): T {
  return { ...row, config: maskPublishConfig(row.config) };
}
