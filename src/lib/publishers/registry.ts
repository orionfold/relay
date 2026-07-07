import type { PublisherAdapter } from "./types";
import { githubPagesAdapter } from "./github-pages-adapter";

const adapters: Record<string, PublisherAdapter> = {
  "github-pages": githubPagesAdapter,
};

/**
 * Get a publisher adapter by target type.
 */
export function getPublisherAdapter(targetType: string): PublisherAdapter {
  const adapter = adapters[targetType];
  if (!adapter) {
    throw new Error(`Unknown publish target type: ${targetType}`);
  }
  return adapter;
}
