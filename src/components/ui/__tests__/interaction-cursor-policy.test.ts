import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const UI_DIR = join(__dirname, "..");
const GLOBALS = join(__dirname, "..", "..", "..", "app", "globals.css");
const APP_BAR = join(__dirname, "..", "..", "shell", "app-bar.tsx");
const GLANCE_RAIL = join(__dirname, "..", "..", "shell", "glance-rail.tsx");
const PRIORITY_QUEUE = join(
  __dirname,
  "..",
  "..",
  "dashboard",
  "priority-queue.tsx",
);
const TABLE_LIST = join(
  __dirname,
  "..",
  "..",
  "tables",
  "table-list-table.tsx",
);
const APP_MATERIALIZED_CARD = join(
  __dirname,
  "..",
  "..",
  "chat",
  "app-materialized-card.tsx",
);
const CURSOR_ASSET_DIR = join(ROOT, "public", "cursors");

const POLICY_ROOTS = [".agents", "design-system", "docs", "features", "src"];
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function collectPolicyFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectPolicyFiles(path);
    const extension = entry.name.slice(entry.name.lastIndexOf("."));
    return TEXT_EXTENSIONS.has(extension) ? [path] : [];
  });
}

describe("interaction affordance policy (highlight-carried, system cursors)", () => {
  it("contains no hand-cursor switching code or guidance", () => {
    const handUtility = ["cursor", "pointer"].join("-");
    const handDeclaration = new RegExp(
      `${["cursor"].join("")}\\s*:\\s*(?:${["pointer"].join("")}|url\\()`,
    );
    const violations = POLICY_ROOTS.flatMap((root) =>
      collectPolicyFiles(join(ROOT, root)).flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return source.includes(handUtility) || handDeclaration.test(source)
          ? [path]
          : [];
      }),
    );

    expect(violations).toEqual([]);
    expect(existsSync(CURSOR_ASSET_DIR)).toBe(false);
  });

  it("keeps disabled and inert subtrees on the truthful default cursor", () => {
    const source = readFileSync(GLOBALS, "utf8");

    expect(source).toMatch(/cursor:\s*default !important;/);
    expect(source).toContain('[aria-disabled="true"] *');
    expect(source).toContain(
      '[data-disabled]:not([data-disabled="false"]) *',
    );
    expect(source).toContain("[inert] *");
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

  it("preserves the Tabs active indicator", () => {
    const source = readFileSync(join(UI_DIR, "tabs.tsx"), "utf8");

    expect(source).toContain("data-[state=active]:after:opacity-100");
  });

  it("keeps disabled buttons hit-testable so nested cards cannot leak affordance", () => {
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

  it("eases the highlight instead of flashing it, with a crisp press", () => {
    const source = readFileSync(GLOBALS, "utf8");

    // Transparent rest outline makes the edge interpolable; none -> solid
    // cannot ease and reads as a flash.
    expect(source).toContain("outline: 1px solid transparent");
    expect(source).toContain(
      "transition-property: background-color, border-color, color, outline-color, box-shadow, transform",
    );
    expect(source).toContain("transition-timing-function: ease-in-out");
    expect(source).toContain("transition-duration: 160ms");
    expect(source).toContain("transition-duration: 40ms");
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

  it("gives linked settings-glance cells the strong interactive treatment", () => {
    const source = readFileSync(GLANCE_RAIL, "utf8");

    expect(source.match(/data-interactive-surface/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/data-interactive-outline="preserve"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/interactive-list-item/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain("hover:bg-accent/70");
  });

  it("keeps dashboard Needs Attention rows on the shared distinguishable hover", () => {
    const source = readFileSync(PRIORITY_QUEUE, "utf8");

    expect(source).toContain("data-interactive-surface");
    expect(source).toContain('data-interactive-outline="preserve"');
    expect(source).toContain("interactive-list-item");
    expect(source).not.toMatch(/hover:bg-accent\/(?:30|50|70)/);
  });

  it("gives Tables list rows the same fill-only interaction contract", () => {
    const source = readFileSync(TABLE_LIST, "utf8");

    expect(source).toContain("data-interactive-surface");
    expect(source).toContain('data-interactive-outline="preserve"');
    expect(source).toContain('className="interactive-list-item"');
  });

  it("keeps list-item hover fill-only while preserving the shared focus ring", () => {
    const source = readFileSync(GLOBALS, "utf8");
    const listHoverRule =
      source.match(/\.interactive-list-item[^{}]+:hover\s*\{[^}]+\}/s)?.[0] ?? "";
    const listActiveRule =
      source.match(/\.interactive-list-item[^{}]+:active\s*\{[^}]+\}/s)?.[0] ?? "";

    expect(listHoverRule).toContain(
      "background-color: var(--interaction-hover-surface)",
    );
    expect(listHoverRule).not.toContain("outline");
    expect(listActiveRule).toContain(
      "background-color: var(--interaction-active-surface)",
    );
    expect(listActiveRule).not.toContain("outline");
    expect(source.match(/:not\(\[data-interactive-outline="preserve"\]\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain("outline-offset: 2px !important");
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]+transition-duration: 0\.01ms !important/,
    );
  });

  it("keeps the decorative boot veil out of pointer hit-testing", () => {
    const source = readFileSync(GLOBALS, "utf8");
    const bootRule = source.match(/\.of-boot\s*\{[^}]+\}/s)?.[0] ?? "";

    expect(bootRule).toContain("pointer-events: none");
  });

  for (const file of [
    "command.tsx",
    "dropdown-menu.tsx",
    "select.tsx",
    "slider.tsx",
    "tabs.tsx",
  ]) {
    it(`${file} keeps disabled choices hit-testable without leaking affordance`, () => {
      const source = readFileSync(join(UI_DIR, file), "utf8");

      expect(source).toContain("cursor-default");
      expect(source).not.toMatch(
        /(?:disabled|data-\[disabled(?:=true)?\]):pointer-events-none/,
      );
    });
  }
});
