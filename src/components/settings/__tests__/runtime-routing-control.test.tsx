import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeRoutingControl } from "../runtime-routing-control";
import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";

const runtimeIds: AgentRuntimeId[] = [
  "claude-code",
  "openai-codex-app-server",
  "anthropic-direct",
  "openai-direct",
  "ollama",
  "litellm",
  "lmstudio",
];

function statuses() {
  return runtimeIds.map((runtimeId, index) => ({
    runtimeId,
    label: [
      "Claude Code",
      "OpenAI Codex App Server",
      "Anthropic Direct API",
      "OpenAI Direct API",
      "Ollama",
      "LiteLLM",
      "LM Studio",
    ][index],
    configured: runtimeId !== "lmstudio",
    health:
      runtimeId === "lmstudio"
        ? ("unconfigured" as const)
        : runtimeId === "litellm"
          ? ("unhealthy" as const)
          : ("healthy" as const),
    healthReason:
      runtimeId === "lmstudio"
        ? "Not configured"
        : runtimeId === "litellm"
          ? "Gateway offline"
          : null,
    checkedAt: runtimeId === "lmstudio" ? null : "2026-07-15T12:00:00.000Z",
    modelId: `${runtimeId}-model`,
    comparableCostPerMillionMicros:
      runtimeId === "anthropic-direct"
        ? 18_000_000
        : runtimeId === "openai-direct"
          ? 40_000_000
          : null,
    capabilitySummary:
      runtimeId === "claude-code" ? ["Filesystem", "Bash"] : [],
    capabilityLimits:
      runtimeId === "claude-code" ? [] : ["No filesystem tools", "No Bash"],
  }));
}

function routing(overrides: Record<string, unknown> = {}) {
  return {
    preference: "latency" as const,
    policy: {
      version: 1 as const,
      eligibleRuntimeIds: [...runtimeIds],
      manualDefaultRuntimeId: "claude-code" as const,
      automaticFallback: true,
    },
    source: "stored" as const,
    needsPersistence: false,
    repairReason: null,
    ...overrides,
  };
}

describe("RuntimeRoutingControl", () => {
  const onSaved = vi.fn();
  const onRefreshHealth = vi.fn(async () => undefined);
  const writes: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        writes.push(body);
        return {
          ok: true,
          json: async () => ({
            ...body,
            source: "stored",
            needsPersistence: false,
            repairReason: null,
          }),
        };
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows all seven runtime states, models, capabilities, and skip reasons", () => {
    render(
      <RuntimeRoutingControl
        routing={routing()}
        statuses={statuses()}
        onSaved={onSaved}
        onRefreshHealth={onRefreshHealth}
      />,
    );
    for (const label of [
      "Claude Code",
      "OpenAI Codex App Server",
      "Anthropic Direct API",
      "OpenAI Direct API",
      "Ollama",
      "LiteLLM",
      "LM Studio",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Gateway offline/)).toBeInTheDocument();
    expect(screen.getAllByText(/Not configured/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Model: ollama-model/)).toBeInTheDocument();
    expect(screen.getAllByText(/No filesystem tools/).length).toBeGreaterThan(0);
  });

  it("orders known cost evidence before unknown pricing without treating unknown as free", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeRoutingControl
        routing={routing()}
        statuses={statuses()}
        onSaved={onSaved}
        onRefreshHealth={onRefreshHealth}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Cost" }));
    const preview = screen.getByText("General-task preview").parentElement;
    if (!preview) throw new Error("preview missing");
    const items = within(preview).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Anthropic Direct API");
    expect(items[1]).toHaveTextContent("OpenAI Direct API");
    expect(items[2]).toHaveTextContent("cost unknown");
  });

  it("places the general-task preview before the eligible runtime list", () => {
    render(
      <RuntimeRoutingControl
        routing={routing()}
        statuses={statuses()}
        onSaved={onSaved}
        onRefreshHealth={onRefreshHealth}
      />,
    );

    const preview = screen.getByText("General-task preview").parentElement;
    const firstRuntime = screen.getByLabelText("Exclude Claude Code");
    expect(
      preview?.compareDocumentPosition(firstRuntime) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("persists exclusions, operator order, and fallback without provider writes", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeRoutingControl
        routing={routing()}
        statuses={statuses()}
        onSaved={onSaved}
        onRefreshHealth={onRefreshHealth}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: "Exclude Claude Code" }));
    await user.click(
      screen.getByRole("button", { name: "Move Anthropic Direct API earlier" }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Allow automatic fallback" }));
    await user.click(screen.getByRole("button", { name: "Save routing" }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      preference: "latency",
      policy: {
        eligibleRuntimeIds: [
          "anthropic-direct",
          "openai-codex-app-server",
          "openai-direct",
          "ollama",
          "litellm",
          "lmstudio",
        ],
        automaticFallback: false,
      },
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("edits a strict Manual default independently from the automatic pool", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeRoutingControl
        routing={routing()}
        statuses={statuses()}
        onSaved={onSaved}
        onRefreshHealth={onRefreshHealth}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Manual" }));
    await user.selectOptions(
      screen.getByLabelText("Default runtime"),
      "lmstudio",
    );
    expect(
      screen.getByText(/Tasks without an explicit runtime use this target strictly/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save routing" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      preference: "manual",
      policy: {
        manualDefaultRuntimeId: "lmstudio",
        eligibleRuntimeIds: runtimeIds,
        automaticFallback: true,
      },
    });
  });

  it("makes an empty pool and repaired storage visibly actionable", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeRoutingControl
        routing={routing({
          source: "repaired",
          needsPersistence: true,
          repairReason: "Stored policy was repaired.",
          policy: {
            version: 1,
            eligibleRuntimeIds: [],
            manualDefaultRuntimeId: "claude-code",
            automaticFallback: false,
          },
        })}
        statuses={statuses()}
        onSaved={onSaved}
        onRefreshHealth={onRefreshHealth}
      />,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByText("Stored policy was repaired.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save routing" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Refresh health" }));
    expect(onRefreshHealth).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failed policy save and preserves the dirty editor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "Storage unavailable" }),
      })),
    );
    const user = userEvent.setup();
    render(
      <RuntimeRoutingControl
        routing={routing()}
        statuses={statuses()}
        onSaved={onSaved}
        onRefreshHealth={onRefreshHealth}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Quality" }));
    await user.click(screen.getByRole("button", { name: "Save routing" }));
    expect(await screen.findByText("Storage unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save routing" })).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
