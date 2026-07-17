import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CustomerBoundaryNotice,
  ProjectBoundaryNotice,
} from "../relay-boundary-notice";

describe("Relay boundary notices", () => {
  it("describes a customer as attribution rather than isolation", () => {
    render(<CustomerBoundaryNotice />);

    expect(screen.getByRole("heading", { name: "Attribution, not isolation" })).toBeInTheDocument();
    expect(screen.getByText(/does not create a separate database/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review Relay cell boundary/ })).toHaveAttribute(
      "href",
      "/settings#settings-instance"
    );
  });

  it("shows an explicit project working directory without calling it a sandbox", () => {
    render(
      <ProjectBoundaryNotice
        workingDirectory="/srv/relay/acme"
        source="project"
      />
    );

    expect(screen.getByText("/srv/relay/acme")).toBeInTheDocument();
    expect(screen.getByText(/selected runtime supports it/)).toBeInTheDocument();
    expect(screen.getByText(/does not isolate Relay data/)).toBeInTheDocument();
  });

  it("names the launch-workspace fallback", () => {
    render(
      <ProjectBoundaryNotice
        workingDirectory="/srv/relay/launch"
        source="launch"
      />
    );

    expect(screen.getByText(/Relay launch workspace as its task working-directory fallback/)).toBeInTheDocument();
  });
});
