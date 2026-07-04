import { toast } from "sonner";

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
        window.location.assign(`/workflows/${workflowId}`);
      },
    },
  });
}
