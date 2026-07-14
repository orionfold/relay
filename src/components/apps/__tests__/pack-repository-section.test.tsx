import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PackRepositorySection } from "../pack-repository-section";

vi.mock("../pack-repository-panel", () => ({
  PackRepositoryPanel: ({ appId }: { appId: string }) => (
    <div data-testid="pack-repository-panel">Repository for {appId}</div>
  ),
}));

describe("PackRepositorySection", () => {
  it("shows repository authoring for a user-created app shell", () => {
    const { getByTestId } = render(
      <PackRepositorySection appId="my-app" origin="user-created" />
    );

    expect(getByTestId("pack-repository-panel")).toHaveTextContent(
      "Repository for my-app"
    );
  });

  it("hides repository authoring for an installed pack shell", () => {
    const { container, queryByTestId } = render(
      <PackRepositorySection appId="licensed-pack" origin="installed-pack" />
    );

    expect(queryByTestId("pack-repository-panel")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
