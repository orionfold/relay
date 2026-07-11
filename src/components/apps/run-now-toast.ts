import { toast } from "sonner";

function navigateWithinApp(href: string): void {
  // Next App Router observes native history mutations. This keeps the current
  // document mounted instead of forcing a full reload with location.assign().
  window.history.pushState(null, "", href);
}

/**
 * BUG-4: "Run now" POSTs the blueprint instantiate endpoint, which creates a
 * `draft` workflow and does NOT dispatch it. The old toast said "Run started",
 * which is a lie — nothing runs until the user hits Execute on the workflow
 * detail page. Surface the truth: a draft was created, and deep-link to where
 * it can be executed.
 *
 * Shared by `run-now-button.tsx` (direct POST) and `run-now-sheet.tsx`
 * (variable path) so the honest copy can't drift between the two.
 */
export function toastDraftCreated(workflowId: string | undefined): void {
  if (!workflowId) {
    // No id to link to — still don't claim it started.
    toast.success("Draft created. Open it in Workflows to Execute.");
    return;
  }
  toast.success("Draft created. Open it in Workflows to Execute.", {
    action: {
      label: "Open workflow",
      onClick: () => {
        navigateWithinApp(`/workflows/${workflowId}`);
      },
    },
  });
}

/**
 * FEAT-6 / CF-FEAT-8: the "Run" verb instantiates AND dispatches (POST
 * .../execute), so the workflow is genuinely running. Say so honestly and
 * point the user at where activity shows up. The prose names Monitor (the
 * live agent-activity stream) as the home for watching progress; the action
 * button opens THIS run's detail page, which carries the step list and the
 * next-step signpost. Distinct from `toastDraftCreated` (the "Create
 * workflow" verb, which only drafts and links to Workflows).
 */
export function toastRunStarted(workflowId: string | undefined): void {
  if (!workflowId) {
    toast.success("Run started. Watch it live in Monitor.");
    return;
  }
  toast.success("Run started. Watch it live in Monitor.", {
    action: {
      label: "Open run",
      onClick: () => {
        navigateWithinApp(`/workflows/${workflowId}`);
      },
    },
  });
}
