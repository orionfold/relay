import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeaderSlotView } from "../header";

describe("HeaderSlotView triggerSourceChip", () => {
  it("renders the trigger-source chip when present", () => {
    render(
      <HeaderSlotView
        slot={{
          title: "Inbox app",
          triggerSourceChip: {
            kind: "row-insert",
            table: "customer-touchpoints",
            blueprintId: "draft",
          },
        }}
        manifestPane={undefined}
      />
    );
    expect(
      screen.getByText(/row insert in customer-touchpoints/i)
    ).toBeInTheDocument();
  });

  it("does not render RunNowButton when triggerSourceChip.kind is row-insert", () => {
    render(
      <HeaderSlotView
        slot={{
          title: "Inbox app",
          runNowBlueprintId: "draft",
          triggerSourceChip: {
            kind: "row-insert",
            table: "customer-touchpoints",
            blueprintId: "draft",
          },
        }}
        manifestPane={undefined}
      />
    );
    expect(screen.queryByRole("button", { name: /^run$/i })).not.toBeInTheDocument();
  });

  it("renders RunNowButton when triggerSourceChip.kind is schedule or manual", () => {
    render(
      <HeaderSlotView
        slot={{
          title: "Coach app",
          runNowBlueprintId: "weekly",
          triggerSourceChip: {
            kind: "schedule",
            scheduleId: "s1",
            blueprintId: "weekly",
          },
        }}
        manifestPane={undefined}
      />
    );
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
  });
});
