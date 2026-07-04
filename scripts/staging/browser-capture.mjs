#!/usr/bin/env node
// Batch route capture for a staging run (staging-browser-smoke Mode B PNG bundle).
// Reads a JSON spec of {steps:[{route,file,wait,fullPage}], consoleLog?, netLog?}
// on argv[2], screenshots each route into the bundle, appends console/network to
// logs. Launches HEADED so the operator can glance at progress (memory
// `staging-headed-browser-preference`). Playwright is not a repo dep — install once
// with `npx playwright@latest install chromium`, then this resolves it from the
// npx cache or a global install.
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { appendFileSync } from 'fs';
const require = createRequire(import.meta.url);
function loadChromium() {
  try { return require('playwright').chromium; } catch {}
  try {
    // Constant argv (no interpolation) via execFileSync — no shell, no injection surface.
    const base = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return require(`${base}/playwright`).chromium;
  } catch {}
  // Fallback: newest playwright in the npx cache.
  const os = require('os'), fs = require('fs'), path = require('path');
  const npx = path.join(os.homedir(), '.npm', '_npx');
  for (const d of fs.readdirSync(npx)) {
    const p = path.join(npx, d, 'node_modules', 'playwright');
    if (fs.existsSync(p)) return require(p).chromium;
  }
  throw new Error('playwright not found — run: npx playwright@latest install chromium');
}
const chromium = loadChromium();

const spec = JSON.parse(process.argv[2]);
const BASE = 'http://127.0.0.1:3199';
const consoleLog = spec.consoleLog;
const netLog = spec.netLog;

// Headed so the operator can glance at live progress (operator directive 2026-07-03).
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
if (consoleLog) {
  page.on('console', (m) => { const t = m.text(); if (/error|warn|exception|fail|ainative|stagent/i.test(t)) appendFileSync(consoleLog, `[${m.type()}] ${page.url()} :: ${t}\n`); });
  page.on('pageerror', (e) => appendFileSync(consoleLog, `[pageerror] ${page.url()} :: ${e.message}\n`));
}
if (netLog) {
  page.on('response', (r) => { const u = r.url(); if (u.includes('/api/')) appendFileSync(netLog, `${r.status()} ${r.request().method()} ${u.replace(BASE,'')}\n`); });
}

// Dismiss modal once at start.
await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
try { const s = page.getByRole('button', { name: /skip, use default/i }); if (await s.isVisible({ timeout: 1500 })) await s.click(); } catch {}

for (const step of spec.steps) {
  await page.goto(BASE + step.route, { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
  await page.waitForTimeout(step.wait || 1200);
  await page.screenshot({ path: step.file, fullPage: step.fullPage !== false });
  console.log('WROTE ' + step.file + '  (' + step.route + ')');
}
await browser.close();
