import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";

/**
 * npm publish contract test.
 *
 * History: `book/` and `ai-native-notes/` once HAD to ship because the in-app
 * kindle reader + in-app chapter generator read them at runtime. That reader
 * was removed (the book lives at ainative.business; authoring now happens via
 * the `book-updater` skill editing markdown directly). So those dirs are now
 * dev/authoring assets that must NOT bloat the published tarball — while the
 * working-tree copies must remain so authoring keeps working.
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

  it("includes docs/ — published user-facing documentation (User Guide)", () => {
    expect(filesSet.has("docs/")).toBe(true);
  });

  it("authoring sources still exist in the working tree (book-updater inputs)", () => {
    // The reader is gone, but the book-updater skill still authors chapters
    // from these dirs in a CC/Codex session — they must remain in the repo.
    expect(existsSync(join(PROJECT_ROOT, "book", "chapters"))).toBe(true);
    expect(existsSync(join(PROJECT_ROOT, "ai-native-notes"))).toBe(true);

    const bookChapters = readdirSync(join(PROJECT_ROOT, "book", "chapters"));
    const notes = readdirSync(join(PROJECT_ROOT, "ai-native-notes"));
    expect(bookChapters.some((f) => f.endsWith(".md"))).toBe(true);
    expect(notes.some((f) => f.endsWith(".md"))).toBe(true);
  });
});
