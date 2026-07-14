import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const UI_DIR = join(__dirname, "..");
const GLOBALS = join(__dirname, "..", "..", "..", "app", "globals.css");
const APP_BAR = join(__dirname, "..", "..", "shell", "app-bar.tsx");
const APP_MATERIALIZED_CARD = join(
  __dirname,
  "..",
  "..",
  "chat",
  "app-materialized-card.tsx",
);
const CURSOR_ASSET = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "public",
  "cursors",
  "relay-hand-pointer-v1.svg",
);

const POINTER_PRIMITIVES: Record<string, number> = {
  "button.tsx": 1,
  "checkbox.tsx": 1,
  "command.tsx": 1,
  "dropdown-menu.tsx": 4,
  "radio-group.tsx": 1,
  "select.tsx": 4,
  "slider.tsx": 1,
  "switch.tsx": 1,
  "tabs.tsx": 1,
};

describe("app-wide hand cursor policy", () => {
  it("makes the semantic policy authoritative over generated defaults", () => {
    const source = readFileSync(GLOBALS, "utf8");

    expect(source).toContain("button:not(:disabled)");
    expect(source).toContain('[role="button"]:not([aria-disabled="true"])');
    expect(source).toContain(".flagship-card-interactive");
    expect(source).toContain(".cursor-pointer");
    expect(source).toMatch(/, pointer !important;/);
    expect(source).toMatch(/cursor:\s*default !important;/);
  });

  it("applies the hand cursor to painted descendants, not only roots", () => {
    const source = readFileSync(GLOBALS, "utf8");

    expect(source).toContain(".cursor-pointer,");
    expect(source).toContain(".cursor-pointer *");
    expect(source).toContain('[aria-disabled="true"] *');
    expect(source).toContain(
      '[data-disabled]:not([data-disabled="false"]) *',
    );
    expect(source).toContain("[inert] *");
    expect(source).toContain(":not([inert] *)");
    expect(source).toContain(':not([aria-disabled="true"] *)');
    expect(source).toContain(
      ':not([data-disabled]:not([data-disabled="false"]) *)',
    );
  });

  it("preserves native text-entry cursors and does not treat every label as a hit target", () => {
    const source = readFileSync(GLOBALS, "utf8");

    expect(source).toContain('input:is([type="text"]');
    expect(source).toContain("textarea:not(:disabled)");
    expect(source).toContain("cursor: text !important");
    expect(source).not.toContain("label[for],");
    expect(source).toContain(
      'label[for]:has(+ :is([role="checkbox"], [role="radio"], [role="switch"])',
    );
  });

  for (const file of ["input.tsx", "textarea.tsx", "label.tsx"]) {
    it(`${file} keeps disabled text surfaces on the truthful default cursor`, () => {
      const source = readFileSync(join(UI_DIR, file), "utf8");

      expect(source).toContain("cursor-default");
      expect(source).not.toContain("cursor-not-allowed");
      expect(source).not.toMatch(
        /(?:disabled|data-\[disabled(?:=true)?\]):pointer-events-none/,
      );
    });
  }

  it("uses an image-backed hand with a standards fallback", () => {
    const source = readFileSync(GLOBALS, "utf8");
    const asset = readFileSync(CURSOR_ASSET, "utf8");

    expect(source).toContain(
      'cursor: url("/cursors/relay-hand-pointer-v1.svg") 7 2, pointer !important;',
    );
    expect(asset).toContain("Lucide Pointer icon");
    expect(source).not.toContain("button:not(:disabled)::after");
  });

  it("keeps every painted shared Button variant on the image-backed cursor", () => {
    const source = readFileSync(GLOBALS, "utf8");

    expect(source).toContain(
      'button[data-slot="button"][data-variant]:not(:disabled)',
    );
  });

  it("preserves the Tabs active indicator", () => {
    const source = readFileSync(join(UI_DIR, "tabs.tsx"), "utf8");

    expect(source).toContain("data-[state=active]:after:opacity-100");
  });

  it("keeps disabled buttons hit-testable so nested cards cannot leak a hand", () => {
    const source = readFileSync(join(UI_DIR, "button.tsx"), "utf8");

    expect(source).toContain("disabled:cursor-default");
    expect(source).not.toContain("disabled:pointer-events-none");
    expect(source).toContain("not-disabled:hover:bg-primary/90");
    expect(source).not.toContain('default: "bg-primary text-primary-foreground hover:');
  });

  it("keeps polymorphic Link buttons hoverable without pretending a disabled anchor is inert", () => {
    const buttonSource = readFileSync(join(UI_DIR, "button.tsx"), "utf8");
    const consumerSource = readFileSync(APP_MATERIALIZED_CARD, "utf8");

    expect(buttonSource).not.toContain("enabled:hover:");
    expect(buttonSource).toContain("not-disabled:hover:");
    expect(consumerSource).not.toMatch(/<Button[^>]*asChild[^>]*disabled/s);
    expect(consumerSource).toContain('status === "running" ?');
  });

  it("excludes disabled and inert surfaces from dark hover, active, and focus states", () => {
    const source = readFileSync(GLOBALS, "utf8");
    const stateGuard =
      ':not(:disabled):not(:disabled *):not([aria-disabled="true"]):not([aria-disabled="true"] *):not([data-disabled]:not([data-disabled="false"])):not([data-disabled]:not([data-disabled="false"]) *):not([inert]):not([inert] *)';

    expect(source.match(new RegExp(stateGuard.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBeGreaterThanOrEqual(5);
  });

  it("defines a dark-only fill plus structural edge without changing top tabs", () => {
    const source = readFileSync(GLOBALS, "utf8");

    expect(source).toContain("--interaction-hover-surface");
    expect(source).toContain("--interaction-hover-edge");
    expect(source).toContain("--interaction-active-surface");
    expect(source).toContain(':not([role="tab"])');
    expect(source).toContain(
      "background-color: var(--interaction-hover-surface) !important",
    );
    expect(source).toContain(
      "outline: 1px solid var(--interaction-hover-edge)",
    );
    expect(source).toContain("outline-offset: 2px !important");
    expect(source).toContain(
      "background-color: var(--interaction-active-surface) !important",
    );
    expect(source).toContain("outline: 2px solid var(--ring)");
  });

  it("does not advertise inert telemetry cells as interactive on hover", () => {
    const source = readFileSync(GLOBALS, "utf8");

    expect(source).toContain("[data-telemetry-card][href]");
    expect(source).not.toMatch(/\[data-telemetry-card\],/);
  });

  it("gives link and menu choice roles the shared focus-visible contract", () => {
    const source = readFileSync(GLOBALS, "utf8");

    expect(source).toContain('[role="link"]:not([aria-disabled="true"])');
    expect(source).toContain(
      '[role="menuitemcheckbox"]:not([aria-disabled="true"])',
    );
    expect(source).toContain(
      '[role="menuitemradio"]:not([aria-disabled="true"])',
    );
  });

  it("keeps destructive menu hover feedback in the destructive color family", () => {
    const globalSource = readFileSync(GLOBALS, "utf8");
    const menuSource = readFileSync(join(UI_DIR, "dropdown-menu.tsx"), "utf8");

    expect(globalSource).toContain(':not([data-variant="destructive"])');
    expect(globalSource).toContain(
      '[data-slot="dropdown-menu-item"][data-variant="destructive"]:not([data-disabled]):hover',
    );
    expect(menuSource).not.toContain(
      "data-[variant=destructive]:hover:bg-destructive/10",
    );
  });

  it("marks the icon-only Settings link as an interactive surface", () => {
    const source = readFileSync(APP_BAR, "utf8");

    expect(source).toContain("data-interactive-surface");
  });

  it("keeps the decorative boot veil out of pointer hit-testing", () => {
    const source = readFileSync(GLOBALS, "utf8");
    const bootRule = source.match(/\.of-boot\s*\{[^}]+\}/s)?.[0] ?? "";

    expect(bootRule).toContain("pointer-events: none");
  });

  for (const [file, minimumPointerContracts] of Object.entries(
    POINTER_PRIMITIVES,
  )) {
    it(`${file} declares enabled pointer affordances locally`, () => {
      const source = readFileSync(join(UI_DIR, file), "utf8");
      const pointerContracts = source.match(/cursor-pointer/g) ?? [];

      expect(pointerContracts.length).toBeGreaterThanOrEqual(
        minimumPointerContracts,
      );
    });
  }

  for (const file of [
    "command.tsx",
    "dropdown-menu.tsx",
    "select.tsx",
    "slider.tsx",
    "tabs.tsx",
  ]) {
    it(`${file} keeps disabled choices hit-testable without leaking a hand`, () => {
      const source = readFileSync(join(UI_DIR, file), "utf8");

      expect(source).toContain("cursor-default");
      expect(source).not.toMatch(
        /(?:disabled|data-\[disabled(?:=true)?\]):pointer-events-none/,
      );
    });
  }
});
