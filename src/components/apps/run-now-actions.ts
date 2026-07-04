/**
 * FEAT-6: the two verbs on a runnable blueprint card share one request path.
 *
 *  - "create" — POST /api/blueprints/[id]/instantiate → a `draft` workflow, no
 *    dispatch. Returns the new workflowId.
 *  - "run"    — instantiate, then POST /api/workflows/[id]/execute so the
 *    workflow genuinely runs (resolves BUG-4). The execute route is
 *    fire-and-forget (202 {status:"started"}).
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
  | { ok: false; error: string; field?: string };

export async function instantiateAndMaybeExecute(
  blueprintId: string,
  variables: Record<string, unknown>,
  mode: RunNowMode,
): Promise<RunNowResult> {
  // 1. Instantiate → draft workflow.
  let instRes: Response;
  try {
    instRes = await fetch(`/api/blueprints/${blueprintId}/instantiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variables }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create draft" };
  }

  if (!instRes.ok) {
    const body = (await instRes.json().catch(() => ({}))) as {
      error?: string;
      field?: string;
      message?: string;
    };
    // A 400 with a field-level message is a validation error the variable form
    // surfaces inline; pass the field through so the caller can target it.
    if (instRes.status === 400 && body.field && body.message) {
      return { ok: false, error: body.message, field: body.field };
    }
    return {
      ok: false,
      error: body.error ?? body.message ?? `Failed to create draft (${instRes.status})`,
    };
  }

  const instBody = (await instRes.json().catch(() => ({}))) as { workflowId?: string };
  const workflowId = instBody.workflowId;

  if (!workflowId) {
    // The draft was created but we have no id to execute or link to. For a
    // create this is a soft success (the toast falls back); for a run we can't
    // dispatch, so report it rather than claim it started.
    if (mode === "create") return { ok: true, workflowId: "" };
    return { ok: false, error: "Draft created but its id was missing, so it could not be started." };
  }

  if (mode === "create") return { ok: true, workflowId };

  // 2. Run: dispatch the draft.
  let execRes: Response;
  try {
    execRes = await fetch(`/api/workflows/${workflowId}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Draft created, but the run could not start." };
  }

  if (!execRes.ok) {
    const body = (await execRes.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? `Draft created, but the run could not start (${execRes.status}).` };
  }

  return { ok: true, workflowId };
}
