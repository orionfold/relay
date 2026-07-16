import { describe, expect, it } from "vitest";
import { presentActivity } from "@/lib/dashboard/activity";

describe("dashboard activity presentation", () => {
  it("turns tool payload JSON into an operator-readable file label", () => {
    expect(
      presentActivity(
        "tool_start",
        JSON.stringify({
          tool: "Write",
          input: { file_path: "/output/result.md" },
        })
      )
    ).toEqual({
      label: "Write started",
      detail: "result.md",
    });
  });

  it("summarizes completion usage without exposing transport JSON", () => {
    expect(
      presentActivity(
        "completed",
        JSON.stringify({
          stop_reason: "end_turn",
          usage: { input_tokens: 9_000, output_tokens: 4_500 },
        })
      )
    ).toEqual({
      label: "Completed",
      detail: "14k tokens · end turn",
    });
  });

  it("does not expose reasoning text or unknown structured payloads", () => {
    expect(
      presentActivity(
        "content_block_start",
        JSON.stringify({ type: "thinking", text: "private reasoning" })
      )
    ).toEqual({
      label: "Reasoning update",
      detail: null,
    });
    expect(
      presentActivity("provider_event", JSON.stringify({ apiKey: "secret" }))
    ).toEqual({
      label: "Provider Event",
      detail: null,
    });
  });
});
