/**
 * Ollama model resolution — import-free leaf.
 *
 * Shared by the task adapter (`ollama-adapter.ts`, runtime-registry-reachable)
 * and the chat engine (`ollama-engine.ts`). Kept dependency-free (only `fetch`)
 * so it can never introduce a module-load cycle into the runtime catalog graph
 * (see memory `shared-constant-zero-import-leaf` + the smoke-test budget rule).
 *
 * Fixes issue #25: a fresh install has no `OLLAMA_DEFAULT_MODEL` setting, so the
 * old code fell back to a hardcoded `llama3.2` that no customer had pulled →
 * every Ollama task 404'd. We instead resolve to an actually-pulled model, or
 * fail with a named, actionable error.
 */

/**
 * Raised when no Ollama model can be resolved — no explicit/default model is
 * set and the local Ollama has no models pulled. Named so callers surface an
 * actionable message instead of a raw 404 on a phantom model (CLAUDE.md #1/#2).
 */
export class OllamaModelNotConfiguredError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "No Ollama model is configured. Pull a model (e.g. `ollama pull llama3.2`) or set a default in Settings → Ollama.",
    );
    this.name = "OllamaModelNotConfiguredError";
  }
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

/** List the models currently pulled into the local Ollama, newest-first order as returned. */
export async function listPulledOllamaModels(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as OllamaTagsResponse;
    return (data.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
  } catch {
    // Connection failures surface elsewhere (testConnection); here we just
    // report "no models available" and let the caller raise the named error.
    return [];
  }
}

/**
 * Resolve the effective Ollama model.
 *
 * Precedence: an explicitly requested model → the configured default →
 * the first actually-pulled model. If none of those yield a model, throw
 * {@link OllamaModelNotConfiguredError} rather than returning a phantom that
 * would 404 at call time.
 *
 * @param baseUrl        Ollama base URL.
 * @param requestedModel A caller-pinned model (e.g. chat's `ollama:` selection). Optional.
 * @param defaultModel   The `OLLAMA_DEFAULT_MODEL` setting value. Optional/empty on fresh install.
 */
export async function resolveOllamaModel(
  baseUrl: string,
  requestedModel?: string | null,
  defaultModel?: string | null,
): Promise<string> {
  const explicit = requestedModel?.trim() || defaultModel?.trim();
  if (explicit) return explicit;

  const pulled = await listPulledOllamaModels(baseUrl);
  if (pulled.length > 0) return pulled[0];

  throw new OllamaModelNotConfiguredError();
}
