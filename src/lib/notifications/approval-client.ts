"use client";

const inflight = new Set<string>();
const RESOLVED_EVENT = "relay:approval-resolved";

export class ApprovalRequestError extends Error {
  constructor(message: string, public readonly code = "APPROVAL_REQUEST_FAILED") {
    super(message);
    this.name = "ApprovalRequestError";
  }
}

export function isAlreadyResolvedApproval(error: unknown): boolean {
  return (
    error instanceof ApprovalRequestError &&
    error.code === "APPROVAL_ALREADY_RESOLVED"
  );
}

export async function runApprovalMutation<T>(
  notificationId: string,
  mutation: () => Promise<T>
): Promise<T> {
  if (inflight.has(notificationId)) {
    throw new ApprovalRequestError(
      "This approval is already being submitted from another view. Wait for it to finish before retrying.",
      "APPROVAL_SUBMISSION_IN_PROGRESS"
    );
  }

  inflight.add(notificationId);
  try {
    return await mutation();
  } finally {
    inflight.delete(notificationId);
  }
}

export async function readApprovalResponse<T>(
  response: Response,
  fallbackMessage: string,
  isSuccessPayload: (value: unknown) => value is T
): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApprovalRequestError(
      response.ok
        ? "The server saved an unreadable response. Refresh to confirm whether the approval resolved before retrying."
        : `${fallbackMessage}. The server returned an unreadable error; retry after refreshing.`,
      "APPROVAL_RESPONSE_MALFORMED"
    );
  }

  if (!response.ok) {
    const record = payload as { error?: unknown; code?: unknown };
    throw new ApprovalRequestError(
      typeof record?.error === "string" ? record.error : fallbackMessage,
      typeof record?.code === "string" ? record.code : "APPROVAL_REQUEST_FAILED"
    );
  }
  if (!isSuccessPayload(payload)) {
    throw new ApprovalRequestError(
      "The server response did not confirm that the approval was saved. Refresh before retrying.",
      "APPROVAL_RESPONSE_MALFORMED"
    );
  }
  return payload;
}

export function announceApprovalResolved(notificationId: string): void {
  window.dispatchEvent(
    new CustomEvent<string>(RESOLVED_EVENT, { detail: notificationId })
  );
}

export function subscribeToResolvedApprovals(
  listener: (notificationId: string) => void
): () => void {
  const handler = (event: Event) => {
    const notificationId = (event as CustomEvent<unknown>).detail;
    if (typeof notificationId === "string") listener(notificationId);
  };
  window.addEventListener(RESOLVED_EVENT, handler);
  return () => window.removeEventListener(RESOLVED_EVENT, handler);
}
