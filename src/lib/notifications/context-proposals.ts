import type { PermissionToolInput } from "@/lib/notifications/permissions";

/**
 * The agent profile a context proposal belongs to.
 *
 * `proposeContextAdditions` in `src/lib/agents/learned-context.ts` records it
 * twice: in `toolInput.profileId`, and in `toolName` so the inbox has something
 * to label the row with. `toolInput` is the authoritative copy — `toolName` is a
 * display field that every other notification kind uses for a tool name, and a
 * row written without it resolves to no profile at all.
 *
 * Returns null when neither carries one, so a caller can decline to build a
 * request rather than sending one to a path with an empty id — which matches no
 * route and comes back as an HTML 404.
 */
export function resolveContextProposalProfileId(
  toolInput: PermissionToolInput | null | undefined,
  toolName: string | null | undefined
): string | null {
  const fromToolInput = toolInput?.profileId;
  if (typeof fromToolInput === "string" && fromToolInput) return fromToolInput;
  if (typeof toolName === "string" && toolName) return toolName;
  return null;
}
