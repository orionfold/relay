export function extractWorkflowTerminalResult(
  definitionJson: string,
  fallbackResults: Array<string | null>
): string | null {
  try {
    const definition = JSON.parse(definitionJson) as {
      _state?: { stepStates?: Array<{ status?: string; result?: string }> };
      _loopState?: { iterations?: Array<{ status?: string; result?: string }> };
    };
    const loopResults = definition._loopState?.iterations ?? [];
    for (let index = loopResults.length - 1; index >= 0; index--) {
      const item = loopResults[index];
      if (item?.status === "completed" && item.result?.trim()) return item.result;
    }
    const stepResults = definition._state?.stepStates ?? [];
    for (let index = stepResults.length - 1; index >= 0; index--) {
      const item = stepResults[index];
      if (item?.status === "completed" && item.result?.trim()) return item.result;
    }
  } catch {
    // Fall through to durable run-scoped task results below.
  }

  for (let index = fallbackResults.length - 1; index >= 0; index--) {
    const result = fallbackResults[index];
    if (result?.trim()) return result;
  }
  return null;
}
