import type { Artifact } from "@/lib/publishers/types";

/**
 * Generator adapter for the generator/publisher substrate (TDR-039).
 * Reads pack-managed rows and emits an Artifact file set — no egress.
 * Minimal Phase-1 interface; the registry shape is decided in Phase 2
 * when the first real generator is built.
 */
export interface GeneratorAdapter {
  generatorType: string;
  generate(
    rows: Array<Record<string, unknown>>,
    config: Record<string, unknown>
  ): Promise<Artifact>;
}
