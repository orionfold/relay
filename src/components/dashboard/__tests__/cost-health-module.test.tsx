import { render, screen } from "@testing-library/react";
import {
  CostHealthModule,
  RuntimeHealthModule,
} from "@/components/dashboard/cost-health-module";

describe("dashboard integrity visualizations", () => {
  it("does not invent full pricing coverage before usage exists", () => {
    render(
      <CostHealthModule costMicros={0} runs={0} unknownPricingRuns={0} />
    );

    expect(screen.getByText("No usage receipts yet")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "No pricing coverage available" })
    ).toBeInTheDocument();
    expect(screen.queryByText("100% priced")).not.toBeInTheDocument();
  });

  it("does not call an undiscovered provider environment ready", () => {
    render(<RuntimeHealthModule configured={0} unconfigured={0} />);

    expect(screen.getByText("No providers detected")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "No model providers detected" })
    ).toBeInTheDocument();
    expect(screen.queryByText("All providers ready")).not.toBeInTheDocument();
  });
});
