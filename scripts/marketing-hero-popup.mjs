// Companion to marketing-screenshots.mjs — the ONE deliberate shot that shows
// the live human-in-the-loop "Permission required" approval popup as a hero
// feature, framed on the Inbox screen. The main script hides this popup on the
// route set; here we keep it. Dark theme, retina density.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(repoRoot, "output", "marketing-screenshots");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.RELAY_BASE || "http://localhost:3000";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1680, height: 1050 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
await context.addCookies([{ name: "relay-theme", value: "dark", url: BASE }]);

const page = await context.newPage();
// Dashboard is the richest backdrop for the approval popup (activity + queue).
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
// The popup arrives via SSE after load — give it time to slide in.
await page.waitForSelector('section[aria-label="Pending approval request"]', {
  timeout: 15000,
});
await page.waitForTimeout(1200);
const dest = path.join(OUT, "20-approval-popup-hitl.png");
await page.screenshot({ path: dest, fullPage: false });
console.log(`✓ hero HITL popup → ${dest}`);

await browser.close();
