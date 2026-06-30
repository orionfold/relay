import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the settings helpers before importing the module under test
vi.mock("@/lib/settings/helpers", () => ({
  getSetting: vi.fn(),
}));

import { getSetting } from "@/lib/settings/helpers";
import {
  getBrowserMcpServers,
  getBrowserAllowedToolPatterns,
  isBrowserTool,
  isBrowserReadOnly,
} from "@/lib/agents/browser-mcp";

const mockGetSetting = vi.mocked(getSetting);

describe("browser-mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getBrowserMcpServers", () => {
    it("returns empty object when neither server is enabled", async () => {
      mockGetSetting.mockResolvedValue(null);
      const servers = await getBrowserMcpServers();
      expect(servers).toEqual({});
    });

    it("returns chrome-devtools config when enabled", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "browser.chromeDevtoolsEnabled") return "true";
        return null;
      });

      const servers = await getBrowserMcpServers();
      expect(servers["chrome-devtools"]).toBeDefined();
      expect(servers["chrome-devtools"].command).toBe("npx");
      expect(servers["chrome-devtools"].args).toContain("chrome-devtools-mcp@latest");
      expect(servers.playwright).toBeUndefined();
    });

    it("returns playwright config when enabled", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "browser.playwrightEnabled") return "true";
        return null;
      });

      const servers = await getBrowserMcpServers();
      expect(servers.playwright).toBeDefined();
      expect(servers.playwright.command).toBe("npx");
      expect(servers.playwright.args).toContain("@playwright/mcp@latest");
      expect(servers["chrome-devtools"]).toBeUndefined();
    });

    it("returns both when both enabled", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "browser.chromeDevtoolsEnabled") return "true";
        if (key === "browser.playwrightEnabled") return "true";
        return null;
      });

      const servers = await getBrowserMcpServers();
      expect(Object.keys(servers)).toHaveLength(2);
      expect(servers["chrome-devtools"]).toBeDefined();
      expect(servers.playwright).toBeDefined();
    });

    it("appends extra args from config", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "browser.chromeDevtoolsEnabled") return "true";
        if (key === "browser.chromeDevtoolsConfig") return "--headless --browser-url http://localhost:9222";
        return null;
      });

      const servers = await getBrowserMcpServers();
      expect(servers["chrome-devtools"].args).toContain("--headless");
      expect(servers["chrome-devtools"].args).toContain("--browser-url");
      expect(servers["chrome-devtools"].args).toContain("http://localhost:9222");
    });

    it("handles JSON array config format", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "browser.playwrightEnabled") return "true";
        if (key === "browser.playwrightConfig") return '["--browser", "firefox"]';
        return null;
      });

      const servers = await getBrowserMcpServers();
      expect(servers.playwright.args).toContain("--browser");
      expect(servers.playwright.args).toContain("firefox");
    });

    it("handles invalid JSON config as space-separated args", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "browser.chromeDevtoolsEnabled") return "true";
        if (key === "browser.chromeDevtoolsConfig") return "[invalid json";
        return null;
      });

      const servers = await getBrowserMcpServers();
      // Invalid JSON starting with [ falls back to space-split
      expect(servers["chrome-devtools"].args).toEqual(["-y", "chrome-devtools-mcp@latest", "[invalid", "json"]);
    });
  });

  describe("getBrowserAllowedToolPatterns", () => {
    it("returns empty when nothing enabled", async () => {
      mockGetSetting.mockResolvedValue(null);
      const patterns = await getBrowserAllowedToolPatterns();
      expect(patterns).toEqual([]);
    });

    it("returns chrome pattern when chrome enabled", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "browser.chromeDevtoolsEnabled") return "true";
        return null;
      });

      const patterns = await getBrowserAllowedToolPatterns();
      expect(patterns).toContain("mcp__chrome-devtools__*");
      expect(patterns).not.toContain("mcp__playwright__*");
    });

    it("returns both patterns when both enabled", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "browser.chromeDevtoolsEnabled") return "true";
        if (key === "browser.playwrightEnabled") return "true";
        return null;
      });

      const patterns = await getBrowserAllowedToolPatterns();
      expect(patterns).toContain("mcp__chrome-devtools__*");
      expect(patterns).toContain("mcp__playwright__*");
    });
  });

  describe("isBrowserTool", () => {
    it("identifies chrome devtools tools", () => {
      expect(isBrowserTool("mcp__chrome-devtools__click")).toBe(true);
      expect(isBrowserTool("mcp__chrome-devtools__take_screenshot")).toBe(true);
    });

    it("identifies playwright tools", () => {
      expect(isBrowserTool("mcp__playwright__browser_navigate")).toBe(true);
      expect(isBrowserTool("mcp__playwright__browser_snapshot")).toBe(true);
    });

    it("rejects non-browser tools", () => {
      expect(isBrowserTool("mcp__relay__list_tasks")).toBe(false);
      expect(isBrowserTool("Read")).toBe(false);
      expect(isBrowserTool("Bash")).toBe(false);
    });
  });

  describe("isBrowserReadOnly", () => {
    it("identifies read-only chrome devtools tools", () => {
      expect(isBrowserReadOnly("mcp__chrome-devtools__take_screenshot")).toBe(true);
      expect(isBrowserReadOnly("mcp__chrome-devtools__list_pages")).toBe(true);
      expect(isBrowserReadOnly("mcp__chrome-devtools__lighthouse_audit")).toBe(true);
    });

    it("identifies read-only playwright tools", () => {
      expect(isBrowserReadOnly("mcp__playwright__browser_snapshot")).toBe(true);
      expect(isBrowserReadOnly("mcp__playwright__browser_tabs")).toBe(true);
    });

    it("rejects mutation browser tools", () => {
      expect(isBrowserReadOnly("mcp__chrome-devtools__click")).toBe(false);
      expect(isBrowserReadOnly("mcp__chrome-devtools__fill")).toBe(false);
      expect(isBrowserReadOnly("mcp__playwright__browser_navigate")).toBe(false);
      expect(isBrowserReadOnly("mcp__playwright__browser_click")).toBe(false);
    });
  });
});
