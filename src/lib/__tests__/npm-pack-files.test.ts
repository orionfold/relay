import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
import { join, resolve } from "path";

/**
 * npm publish contract test.
 *
 * History: `book/` and `ai-native-notes/` once HAD to ship because the in-app
 * kindle reader + in-app chapter generator read them at runtime. That reader
 * was removed (the book lives at ainative.business), and in 2026-06 the book
 * authoring + content was extracted entirely to the private ~/orionfold/books
 * repo. So these dirs must NOT bloat the published tarball — and they are no
 * longer authoring inputs *in this repo* (book-updater now runs from books/).
 * This test guards the standing product-safety contract: the book never ships
 * in the npm package, regardless of whether stray working-tree copies linger.
 */
describe("npm publish contract", () => {
  const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
  const pkg = JSON.parse(
    readFileSync(join(PROJECT_ROOT, "package.json"), "utf-8")
  ) as { files: string[] };

  const filesSet = new Set(pkg.files);

  it("does NOT publish book/ — reader removed, book/ is an authoring asset", () => {
    const shipsBook = pkg.files.some(
      (f) => f.startsWith("book/") || f === "book"
    );
    expect(
      shipsBook,
      `package.json files must NOT include book/* — the in-app reader was removed. Current files: ${JSON.stringify(pkg.files)}`
    ).toBe(false);
  });

  it("does NOT publish ai-native-notes/ — authoring-only input to book-updater", () => {
    const shipsNotes = pkg.files.some(
      (f) => f.startsWith("ai-native-notes")
    );
    expect(
      shipsNotes,
      `package.json files must NOT include ai-native-notes — authoring-only. Current files: ${JSON.stringify(pkg.files)}`
    ).toBe(false);
  });

  it("includes dist/ and src/ — CLI entry + Next.js server code", () => {
    expect(filesSet.has("dist/")).toBe(true);
    expect(filesSet.has("src/")).toBe(true);
  });

  it("does NOT publish docs/ — User Guide UI removed; doc generation moved to ~/orionfold/books", () => {
    // The in-app User Guide UI and the generated docs corpus were removed in
    // 2026-06; doc generation now lives in the private books repo. docs/ must
    // not ship in the tarball.
    const shipsDocs = pkg.files.some((f) => f === "docs/" || f.startsWith("docs/"));
    expect(
      shipsDocs,
      `package.json files must NOT include docs/ — User Guide removed, docs generation extracted. Current files: ${JSON.stringify(pkg.files)}`
    ).toBe(false);
  });

  it("book content is no longer git-tracked in this repo (extracted to ~/orionfold/books)", () => {
    // The book authoring + content moved to the private books repo in 2026-06.
    // Whether or not stray working-tree copies linger on a given machine, the
    // dirs must not be tracked here so they never re-enter the open repo or the
    // npm tarball. Tracked-file membership is the durable guarantee; on-disk
    // presence is incidental and intentionally NOT asserted.
    const tracked = execFileSync(
      "git",
      ["ls-files", "book", "ai-native-notes"],
      { cwd: PROJECT_ROOT, encoding: "utf-8" }
    ).trim();
    expect(
      tracked,
      `book/ and ai-native-notes/ must be untracked (extracted to ~/orionfold/books). Still tracked:\n${tracked}`
    ).toBe("");
  });
});
