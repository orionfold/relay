import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockRewind = vi.fn();
const mockRestore = vi.fn();
const mockBranchingEnabled = { current: true };
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("../chat-session-provider", () => ({
  useChatSession: () => ({
    branchingEnabled: mockBranchingEnabled.current,
    rewindLastTurn: mockRewind,
    restoreLastRewoundPair: mockRestore,
  }),
}));

vi.mock("@/hooks/use-chat-autocomplete", () => ({
  useChatAutocomplete: () => ({
    state: { open: false, mode: "slash", query: "", anchorRect: null },
    handleKeyDown: () => false,
    handleChange: () => {},
    handleSelect: () => undefined,
    setTextareaRef: () => {},
    activeTab: "skill",
    setActiveTab: () => {},
    entityResults: [],
    entityLoading: false,
    mentions: [],
    close: () => {},
  }),
}));
vi.mock("@/hooks/use-project-skills", () => ({
  useProjectSkills: () => ({ skills: [] }),
}));
vi.mock("@/lib/agents/runtime/catalog", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/agents/runtime/catalog")
  >();
  return {
    ...actual,
    resolveAgentRuntime: () => "claude-code",
  };
});
vi.mock("@/lib/chat/types", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat/types")>(
    "@/lib/chat/types"
  );
  return {
    ...actual,
    getRuntimeForModel: () => "claude-code",
    resolveModelLabel: (id: string) => id,
  };
});

// eslint-disable-next-line import/first
import { ChatInput } from "../chat-input";

describe("ChatInput — rewind keybindings", () => {
  beforeEach(() => {
    mockRewind.mockReset();
    mockRestore.mockReset();
    mockBranchingEnabled.current = true;
  });

  it("⌘Z calls rewindLastTurn and pre-fills composer with returned content", async () => {
    mockRewind.mockResolvedValueOnce({ rewoundUserContent: "previous question" });

    render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        isHeroMode={false}
        modelId="claude-sonnet-4-6"
      />
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: "z", metaKey: true });
    await waitFor(() => {
      expect(mockRewind).toHaveBeenCalledTimes(1);
      expect(textarea.value).toBe("previous question");
    });
  });

  it("⌘⇧Z calls restoreLastRewoundPair", async () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        isHeroMode={false}
        modelId="claude-sonnet-4-6"
      />
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "z", metaKey: true, shiftKey: true });
    await waitFor(() => {
      expect(mockRestore).toHaveBeenCalledTimes(1);
    });
  });

  it("ignores ⌘Z when branchingEnabled is false", () => {
    mockBranchingEnabled.current = false;
    render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        isHeroMode={false}
        modelId="claude-sonnet-4-6"
      />
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "z", metaKey: true });
    expect(mockRewind).not.toHaveBeenCalled();
  });

  it("does not pre-fill composer when rewoundUserContent is null (no assistant turn)", async () => {
    mockRewind.mockResolvedValueOnce({ rewoundUserContent: null });

    render(
      <ChatInput
        onSend={vi.fn()}
        onStop={vi.fn()}
        isStreaming={false}
        isHeroMode={false}
        modelId="claude-sonnet-4-6"
      />
    );
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: "z", metaKey: true });
    await waitFor(() => expect(mockRewind).toHaveBeenCalledTimes(1));
    expect(textarea.value).toBe("");
  });
});
