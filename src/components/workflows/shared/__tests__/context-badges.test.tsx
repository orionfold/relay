import { render, screen } from "@testing-library/react";

import { ProjectContextBadges } from "@/components/projects/project-context-badges";
import { WorkflowProjectBadge } from "@/components/workflows/shared/workflow-project-badge";

describe("Foundation context badges", () => {
  it("renders the workflow's real linked project name", () => {
    render(
      <WorkflowProjectBadge projectId="project-1" projectName="Acme rollout" />
    );

    expect(screen.getByRole("link", { name: "Open project Acme rollout" }))
      .toHaveAttribute("href", "/projects/project-1");
    expect(screen.getByText("Acme rollout")).toBeInTheDocument();
  });

  it("renders no workflow relationship for an unlinked workflow", () => {
    const { container } = render(
      <WorkflowProjectBadge projectId={null} projectName={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders linked and unlinked project customer truth", () => {
    const { rerender } = render(
      <ProjectContextBadges
        customerId="customer-1"
        customerName="Northwind"
        status="active"
      />
    );
    expect(screen.getByRole("link", { name: "Open customer Northwind" }))
      .toHaveAttribute("href", "/customers/customer-1");

    rerender(
      <ProjectContextBadges customerId={null} customerName={null} status="active" />
    );
    expect(screen.getByText("No customer")).toBeInTheDocument();
  });
});
