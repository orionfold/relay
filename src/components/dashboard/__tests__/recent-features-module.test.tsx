import { render, screen } from "@testing-library/react";
import { RecentFeaturesModule } from "@/components/dashboard/recent-features-module";

describe("RecentFeaturesModule", () => {
  it("lists launched features with destination-specific actions", () => {
    render(
      <RecentFeaturesModule
        features={[
          {
            id: "operator-workshop",
            title: "Relay Operator Workshop",
            summary: "Run a deterministic workshop.",
            href: "/workshop",
            actionLabel: "Run Workshop",
            launchedAt: "2026-07-16",
          },
          {
            id: "semantic-tables",
            title: "Semantic table rendering",
            summary: "Render type-aware records.",
            href: "/tables",
            actionLabel: "Open Tables",
            launchedAt: "2026-07-16",
          },
        ]}
      />
    );

    expect(
      screen.getByRole("link", { name: /Run Workshop/ })
    ).toHaveAttribute("href", "/workshop");
    expect(screen.getByRole("link", { name: /Open Tables/ })).toHaveAttribute(
      "href",
      "/tables"
    );
    expect(screen.getAllByText("New")).toHaveLength(1);
  });
});
