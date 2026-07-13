import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmbeddedMarkdown, parseInsightSegments } from "../embedded-markdown";

const insightMarkdown = `# Report title

## Findings

### Detail

\`★ Insight ─────────────────\`
- The semantic callout renders.
- **Bold evidence** remains markdown.
\`────────────────────────────\`

[Official source](https://example.com) and [unsafe](javascript:alert(1)).`;

describe("EmbeddedMarkdown", () => {
  it("subordinates embedded headings and renders Insight syntax semantically", () => {
    render(<EmbeddedMarkdown content={insightMarkdown} />);

    expect(screen.getByRole("heading", { level: 3, name: "Report title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Findings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 5, name: "Detail" })).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Insight" })).toHaveTextContent(
      "The semantic callout renders.",
    );
    expect(screen.getByRole("link", { name: "Official source" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByText("unsafe").closest("a")).toBeNull();
  });

  it("preserves full hierarchy in document mode and leaves malformed callouts untouched", () => {
    const { rerender } = render(
      <EmbeddedMarkdown content="# Document title" hierarchy="document" />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Document title" })).toBeInTheDocument();

    rerender(<EmbeddedMarkdown content="`★ Insight ─────`\nNo closing marker" />);
    expect(screen.queryByRole("note", { name: "Insight" })).not.toBeInTheDocument();
    expect(parseInsightSegments("plain text")).toEqual([
      { kind: "markdown", content: "plain text" },
    ]);
  });
});
