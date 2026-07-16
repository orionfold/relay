import { render, screen } from "@testing-library/react";
import { DashboardModuleCard } from "@/components/dashboard/dashboard-module-card";

describe("DashboardModuleCard", () => {
  it("keeps the named destination action on the title row", () => {
    const { container } = render(
      <DashboardModuleCard
        definition={{
          id: "activity",
          title: "Autonomous activity",
          description: "Recent activity",
          defaultVisible: true,
          defaultOrder: 1,
          sourceRoute: "/monitor",
          sourceLabel: "Monitor",
        }}
      >
        <p>Activity data</p>
      </DashboardModuleCard>
    );

    const header = container.querySelector('[data-slot="card-header"]');
    expect(header).toHaveClass(
      "flex",
      "flex-row",
      "items-center",
      "justify-between"
    );
    expect(
      screen.getByRole("link", { name: "Open Monitor" })
    ).toHaveTextContent("Open Monitor");
  });
});
