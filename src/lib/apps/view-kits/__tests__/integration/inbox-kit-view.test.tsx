import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderKitView } from "../render-kit-view";
import { inboxKit } from "../../kits/inbox";

// InboxSplitView uses next/navigation hooks — mock for jsdom env
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => "/",
}));

const manifest = {
  id: "cfd",
  name: "Customer follow-up drafter",
  profiles: [],
  blueprints: [{
    id: "draft",
    name: "Draft",
    trigger: { kind: "row-insert", table: "touchpoints" },
  }],
  schedules: [],
  tables: [{
    id: "touchpoints",
    name: "touchpoints",
    columns: [{ name: "summary" }, { name: "channel" }, { name: "sentiment" }],
  }],
} as any;

describe("Inbox kit — KitView integration", () => {
  it("renders trigger-source chip and suppresses Run Now for row-insert", () => {
    renderKitView({
      kit: inboxKit,
      manifest,
      columns: [{
        tableId: "touchpoints",
        columns: [{ name: "summary" }, { name: "channel" }, { name: "sentiment" }],
      }],
      runtime: { inboxQueueRows: [], inboxSelectedRowId: null, inboxDraftDocument: null },
    });
    expect(screen.getByText(/row insert in touchpoints/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^run$/i })).not.toBeInTheDocument();
  });

  it("renders hero with inbox-split content", () => {
    const { container } = renderKitView({
      kit: inboxKit,
      manifest,
      columns: [{
        tableId: "touchpoints",
        columns: [{ name: "summary" }, { name: "channel" }],
      }],
      runtime: {
        inboxQueueRows: [
          { id: "r1", tableId: "touchpoints", values: { summary: "Acme reply", channel: "email" } },
        ],
        inboxSelectedRowId: "r1",
        inboxDraftDocument: { id: "d1", filename: "draft.md", content: "Hi", taskId: "t1" },
      },
    });
    expect(container.querySelector('[data-kit-pane="queue"]')).toBeInTheDocument();
    expect(container.querySelector('[data-kit-pane="draft"]')).toBeInTheDocument();
    expect(screen.getByText(/acme reply/i)).toBeInTheDocument();
  });
});
