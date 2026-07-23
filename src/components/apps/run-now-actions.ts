/**
 * FEAT-6: the two verbs on a runnable blueprint card share one request path.
 *
 *  - "create" — POST /api/blueprints/[id]/instantiate → a `draft` workflow, no
 *    dispatch. Returns the new workflowId.
 *  - "run"    — POST one idempotent server-owned start boundary that
 *    preflights before atomically creating and claiming the workflow.
 *
 * Extracted so `run-now-button.tsx` (direct) and `run-now-sheet.tsx` (variable
 * path) can't drift. Every failure surfaces an explicit error (principle #1);
 * the caller toasts it — this helper never toasts, so it stays pure/testable.
 */

export type RunNowMode = "run" | "create";

export type RunNowResult =
  | { ok: true; workflowId: string }
  // `field` is set when the instantiate endpoint returns a 400 with a
  // `{ field, message }` body, so a variable-form caller can surface it inline.
  | { ok: false; error: string; field?: string; code?: string };

const RUNTIME_SETUP_CODES = new Set([
  "runtime_capability_mismatch",
  "runtime_unavailable",
  "model_unavailable",
  "no_compatible_runtime",
  "empty_eligible_runtime_pool",
  "no_eligible_runtime",
  "cell_identity_invalid",
]);

export function needsRuntimeSetup(result: RunNowResult): boolean {
  return !result.ok && !!result.code && RUNTIME_SETUP_CODES.has(result.code);
}

export async function instantiateAndMaybeExecute(
  blueprintId: string,
  variables: Record<string, unknown>,
  mode: RunNowMode,
  idempotencyKey = crypto.randomUUID(),
): Promise<RunNowResult> {
  const endpoint =
    mode === "run"
      ? `/api/blueprints/${blueprintId}/start`
      : `/api/blueprints/${blueprintId}/instantiate`;
  let instRes: Response;
  try {
    instRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variables,
        ...(mode === "run" ? { idempotencyKey } : {}),
      }),
    });
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : mode === "run"
            ? "The run could not start."
            : "Could not create draft",
    };
  }

  if (!instRes.ok) {
    const body = (await instRes.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      field?: string;
      message?: string;
    };
    // A 400 with a field-level message is a validation error the variable form
    // surfaces inline; pass the field through so the caller can target it.
    if (instRes.status === 400 && body.field && body.message) {
      return {
        ok: false,
        error: body.message,
        field: body.field,
        ...(body.code ? { code: body.code } : {}),
      };
    }
    return {
      ok: false,
      error:
        body.error ??
        body.message ??
        `${mode === "run" ? "Failed to start run" : "Failed to create draft"} (${instRes.status})`,
      ...(body.code ? { code: body.code } : {}),
    };
  }

  const instBody = (await instRes.json().catch(() => ({}))) as { workflowId?: string };
  const workflowId = instBody.workflowId;

  if (!workflowId) {
    return {
      ok: false,
      error:
        mode === "run"
          ? "The server started no identifiable workflow."
          : "The draft was created without an identifiable workflow.",
    };
  }

  return { ok: true, workflowId };
}
