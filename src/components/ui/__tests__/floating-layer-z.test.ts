import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for #49 (customer dropdown invisible in Create Project).
 *
 * Sheets sit on the project overlay token `--z-overlay` (100) so they clear
 * the boot veil (fix-in-app-preview-sheet-visibility). Every floating layer
 * that can open from INSIDE a sheet — select popups, dropdown menus,
 * popovers, dialogs, alert dialogs, tooltips — must sit on the SAME token,
 * not Tailwind's `z-50`, or it paints underneath the sheet overlay: the
 * popup mounts, reports visible computed styles, and shows zero pixels.
 *
 * Stacking between same-token layers is resolved by portal mount order
 * (later-opened portals paint above), which is the pre-existing invariant
 * from when every layer was `z-50`.
 *
 * jsdom cannot compute stacking contexts, so this guard pins the token at
 * the source level; the end-to-end pixel check lives in the #49 verify run.
 */

const UI_DIR = join(__dirname, "..");

// Every ui primitive that portals a floating layer to <body>.
const FLOATING_PRIMITIVES = [
  "select.tsx",
  "dropdown-menu.tsx",
  "popover.tsx",
  "dialog.tsx",
  "alert-dialog.tsx",
  "tooltip.tsx",
];

describe("floating layers stack on the overlay z token", () => {
  for (const file of FLOATING_PRIMITIVES) {
    it(`${file} uses z-[var(--z-overlay)] and never bare z-50`, () => {
      const source = readFileSync(join(UI_DIR, file), "utf8");
      expect(source).toContain("z-[var(--z-overlay)]");
      expect(source).not.toMatch(/\bz-50\b/);
    });
  }

  it("sheet.tsx stays on the overlay token (the layer popups must match)", () => {
    const source = readFileSync(join(UI_DIR, "sheet.tsx"), "utf8");
    expect(source).toContain("z-[var(--z-overlay)]");
  });
});
