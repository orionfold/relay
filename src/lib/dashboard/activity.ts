export interface ActivityPresentation {
  label: string;
  detail: string | null;
}

const EVENT_LABELS: Record<string, string> = {
  message_start: "Assistant response",
  content_block_start: "Response started",
  content_block_delta: "Response update",
  content_start: "Response started",
  content_delta: "Response update",
  tool_start: "Tool started",
  completed: "Completed",
  error: "Error",
};

function excerpt(value: string, max = 72): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const characters = Array.from(normalized);
  return characters.length > max
    ? `${characters.slice(0, max).join("")}…`
    : normalized;
}

function formatTokenCount(value: number): string {
  if (value < 1_000) return value.toLocaleString();
  return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
}

function fileName(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseObject(payload: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function presentActivity(
  event: string,
  payload: string | null
): ActivityPresentation {
  const label = EVENT_LABELS[event] ?? humanize(event);
  if (!payload) return { label, detail: null };

  const object = parseObject(payload);
  if (!object) {
    return { label, detail: excerpt(payload) || null };
  }

  if (event === "tool_start") {
    const tool = typeof object.tool === "string" ? humanize(object.tool) : "Tool";
    const input =
      object.input && typeof object.input === "object" && !Array.isArray(object.input)
        ? (object.input as Record<string, unknown>)
        : null;
    const rawPath =
      typeof input?.file_path === "string"
        ? input.file_path
        : typeof input?.path === "string"
          ? input.path
          : null;
    return {
      label: `${tool} started`,
      detail: rawPath ? fileName(rawPath) : null,
    };
  }

  if (event === "completed") {
    const usage =
      object.usage && typeof object.usage === "object" && !Array.isArray(object.usage)
        ? (object.usage as Record<string, unknown>)
        : null;
    const inputTokens =
      typeof usage?.input_tokens === "number" ? usage.input_tokens : 0;
    const outputTokens =
      typeof usage?.output_tokens === "number" ? usage.output_tokens : 0;
    const totalTokens = inputTokens + outputTokens;
    const stopReason =
      typeof object.stop_reason === "string"
        ? humanize(object.stop_reason).toLowerCase()
        : null;
    const parts = [
      totalTokens > 0 ? `${formatTokenCount(totalTokens)} tokens` : null,
      stopReason,
    ].filter((part): part is string => Boolean(part));
    return { label, detail: parts.join(" · ") || null };
  }

  if (event === "message_start") {
    const model =
      typeof object.model === "string" ? humanize(object.model) : null;
    return { label, detail: model };
  }

  if (event === "content_block_start" || event === "content_block_delta") {
    if (object.type === "thinking") {
      return { label: "Reasoning update", detail: null };
    }
    const text = typeof object.text === "string" ? excerpt(object.text) : "";
    return { label, detail: text || null };
  }

  if (event === "error") {
    const message =
      typeof object.message === "string"
        ? object.message
        : typeof object.error === "string"
          ? object.error
          : "";
    return { label, detail: excerpt(message) || null };
  }

  // Unknown structured payloads stay private. The event remains visible, but
  // internal transport fields, paths, prompts and provider metadata do not.
  return { label, detail: null };
}
