import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopyViewDeclarationButton } from "@/components/apps/copy-view-declaration-button";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

describe("CopyViewDeclarationButton", () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("copies the exact YAML declaration", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CopyViewDeclarationButton value={"view:\n  kit: coach\n"} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy view declaration" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("view:\n  kit: coach\n"));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("View declaration copied");
  });

  it("reports clipboard refusal instead of claiming success", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("permission denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(document, "execCommand", { value: vi.fn(() => false), configurable: true });
    render(<CopyViewDeclarationButton value={"view:\n  kit: inbox\n"} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy view declaration" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("View declaration could not be copied"));
    expect(screen.getByRole("button", { name: "Copy view declaration" })).toBeInTheDocument();
  });

  it("falls back to selection copy when the Clipboard API is refused", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("permission denied"));
    const execCommand = vi.fn(() => true);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    render(<CopyViewDeclarationButton value={"view:\n  kit: tracker\n"} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy view declaration" }));

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("View declaration copied");
  });
});
