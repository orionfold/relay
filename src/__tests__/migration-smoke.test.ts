import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrateLegacyData } from "@/lib/utils/migrate-to-ainative";

describe("migration smoke", () => {
  it("migrates a realistic stagent dir onto ~/.relay in one call", async () => {
    const home = mkdtempSync(join(tmpdir(), "ainative-smoke-"));
    try {
      const oldDir = join(home, ".stagent");
      mkdirSync(oldDir, { recursive: true });
      mkdirSync(join(oldDir, "uploads"), { recursive: true });
      mkdirSync(join(oldDir, "screenshots"), { recursive: true });
      writeFileSync(join(oldDir, "stagent.db"), "");

      const report = await migrateLegacyData({ home });

      expect(report.dirMigrated).toBe(true);
      expect(report.dbFilesRenamed).toBeGreaterThanOrEqual(1);
      expect(existsSync(join(home, ".relay", "uploads"))).toBe(true);
      expect(existsSync(join(home, ".relay", "relay.db"))).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
