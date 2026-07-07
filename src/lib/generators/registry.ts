import type { GeneratorAdapter } from "./types";
import { staticSiteGenerator } from "./static-site-generator";

/**
 * Generator adapters keyed by generatorType. Lightweight dispatch mirroring
 * src/lib/channels/registry.ts and the publisher registry (TDR-039 Phase 2
 * settles the "which registry shape" open question: generators are behavioral
 * adapters, so the same Record<type, adapter> dispatch the publishers use).
 */
const adapters: Record<string, GeneratorAdapter> = {
  "static-site": staticSiteGenerator,
};

/**
 * Get a generator adapter by type.
 */
export function getGeneratorAdapter(generatorType: string): GeneratorAdapter {
  const adapter = adapters[generatorType];
  if (!adapter) {
    throw new Error(`Unknown generator type: ${generatorType}`);
  }
  return adapter;
}
