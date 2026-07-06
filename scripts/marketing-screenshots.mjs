// One-off marketing screenshot capture — high-fidelity dark-theme shots of the
// key Relay screens against a running, seeded dev instance on :3000.
// Not part of the release gate; kept in scripts/ for repeatability.
//
// Usage: npx playwright@latest ... is not needed — we import the cached module.
//   node scripts/marketing-screenshots.mjs
// Prereqs: dev server up on :3000, data seeded (POST /api/data/seed).
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(repoRoot, "output", "marketing-screenshots");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.RELAY_BASE || "http://localhost:3000";
// Marketing viewport: wide desktop, retina density for crisp PNGs.
const VIEWPORT = { width: 1680, height: 1050 };
const SCALE = 2;

// Each shot: a slug (→ filename), a URL path, and an optional settle hint.
// fullPage:false → viewport-framed hero shots (the app chrome + first fold);
// fullPage:true → the whole scrollable screen for content-dense views.
const SHOTS = [
  { slug: "01-dashboard", url: "/", wait: 1200 },
  { slug: "02-tasks-board", url: "/tasks", wait: 1200 },
  { slug: "03-chat", url: "/chat", wait: 1200 },
  { slug: "04-inbox", url: "/inbox", wait: 1000 },
  { slug: "05-apps", url: "/apps", wait: 1200 },
  { slug: "06-packs", url: "/packs", wait: 1400, fullPage: true },
  { slug: "07-projects", url: "/projects", wait: 1000 },
  { slug: "08-workflows", url: "/workflows", wait: 1200 },
  { slug: "09-blueprints", url: "/blueprints", wait: 1200 },
  { slug: "10-agents", url: "/agents", wait: 1000 },
  { slug: "11-presets", url: "/presets", wait: 1000 },
  { slug: "12-customers", url: "/customers", wait: 1000 },
  { slug: "13-schedules", url: "/schedules", wait: 1000 },
  { slug: "14-documents", url: "/documents", wait: 1000 },
  { slug: "15-tables", url: "/tables", wait: 1200 },
  { slug: "16-schemas", url: "/schemas", wait: 1000 },
  { slug: "17-monitor", url: "/monitor", wait: 1400 },
  { slug: "18-costs", url: "/costs", wait: 1600, fullPage: true },
  { slug: "19-settings", url: "/settings", wait: 1200, fullPage: true },
];

const results = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: "dark",
});
// Force dark theme server-side: the app reads the relay-theme cookie in SSR.
await context.addCookies([
  { name: "relay-theme", value: "dark", url: BASE },
]);

// Hide the live "Pending approval" popup so the route set is pristine. It is a
// real HITL feature (captured separately as its own hero shot), but anchored to
// the viewport it repeats on every route and overlaps content. CSS-only — it
// hides pixels at capture time and touches no data. Injected per-page AFTER the
// DOM settles (the popup mounts via SSE post-load, so an init-time style misses
// it); the selector matches the section's aria-label.
const HIDE_POPUP_CSS = `section[aria-label="Pending approval request"]{display:none !important}`;

const page = await context.newPage();

for (const shot of SHOTS) {
  const dest = path.join(OUT, `${shot.slug}.png`);
  try {
    // The app holds a persistent SSE/live connection, so the network never goes
    // idle — wait for the DOM + a fixed settle beat for charts/async cards.
    await page.goto(`${BASE}${shot.url}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(shot.wait ?? 1000);
    // Suppress the anchored approval popup for the clean route set.
    await page.addStyleTag({ content: HIDE_POPUP_CSS });
    await page.waitForTimeout(150);
    await page.screenshot({ path: dest, fullPage: !!shot.fullPage });
    results.push({ slug: shot.slug, url: shot.url, ok: true });
    console.log(`✓ ${shot.slug.padEnd(16)} ${shot.url}`);
  } catch (err) {
    results.push({ slug: shot.slug, url: shot.url, ok: false, error: String(err).split("\n")[0] });
    console.log(`✗ ${shot.slug.padEnd(16)} ${shot.url} — ${String(err).split("\n")[0]}`);
  }
}

await browser.close();

const ok = results.filter((r) => r.ok).length;
console.log(`\n[marketing] ${ok}/${results.length} shots captured → ${OUT}`);
if (ok < results.length) {
  console.log("Failed:", results.filter((r) => !r.ok).map((r) => r.slug).join(", "));
}
