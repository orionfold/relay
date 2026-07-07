import { createHash } from "crypto";
import type { GeneratorAdapter } from "./types";
import type { Artifact } from "@/lib/publishers/types";
import {
  parseStaticSiteSettings,
  type StaticSiteSettings,
} from "./static-site-settings";
import {
  assertTemplateSupportsSettings,
  getStaticSiteTemplate,
  type StaticSiteTemplate,
} from "./static-site-templates";

/**
 * Static-site generator (TDR-039 Phase 2). Turns ordered landing-page section
 * rows into a single self-contained `index.html` Artifact — no external assets,
 * no egress, no DB, no clock/random (deterministic: same input → same hash).
 *
 * Row contract (locked in the Phase-2 design doc). Extra columns are ignored:
 *   kind     hero | features | cta | text   (unknown kind → skipped)
 *   heading  text                           (HTML-escaped)
 *   body     text?                          (HTML-escaped)
 *   order    number                         (asc; missing/NaN → last, stable)
 *   ctaLabel text?                          (HTML-escaped)
 *   ctaUrl   text?                          (attr-escaped; javascript: → "#")
 *   imageUrl text?                          (attr-escaped; javascript: → "#")
 *   status   text?                          (only "published" renders — fail-safe)
 */

const KNOWN_KINDS = new Set(["hero", "features", "cta", "text"]);

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Escape text destined for an HTML text node. */
function escapeHtml(v: unknown): string {
  return str(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape a URL for use in an href/src attribute. Default-DENY allowlist: a
 * value is only kept if, after stripping the chars a browser ignores while
 * parsing a scheme (ASCII control chars + all whitespace, incl. embedded tabs
 * and newlines), it either has no scheme (relative / fragment / protocol-
 * relative) or an explicitly allowed one (http, https, mailto). Everything else
 * — `javascript:`, `data:`, `vbscript:`, and their control-char/whitespace
 * obfuscations (`\x01javascript:`, `java\tscript:`, `java\nscript:`) —
 * collapses to "#". A blocklist here is unsafe: browsers ignore those chars, so
 * the raw string must be normalized BEFORE the scheme is read.
 */
function safeUrl(v: unknown): string {
  const raw = str(v).trim();
  if (raw === "") return "#";
  // Normalize the way a browser would when reading the scheme: drop ASCII
  // control chars (\x00-\x1F, \x7F) and ALL whitespace, then look for a scheme.
  // eslint-disable-next-line no-control-regex
  const normalized = raw.replace(/[\x00-\x20\x7F]/g, "");
  const scheme = normalized.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (scheme) {
    const s = scheme[1]!.toLowerCase();
    if (s !== "http" && s !== "https" && s !== "mailto") return "#";
  }
  // No scheme (relative/fragment/protocol-relative) or an allowed one — keep the
  // ORIGINAL raw value (attr-escaped). A scheme-relative "//host" has no scheme
  // match and is allowed, matching the prior behavior.
  return escapeHtml(raw);
}

/** Numeric order with missing/NaN sorting last. */
function orderOf(row: Record<string, unknown>): number {
  const n = Number(row.order);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function renderCta(row: Record<string, unknown>, settings: StaticSiteSettings): string {
  if (!settings.showCtas) return "";
  const label = str(row.ctaLabel);
  const url = str(row.ctaUrl);
  if (label === "" && url === "") return "";
  return `<a class="cta" href="${safeUrl(url)}">${escapeHtml(label || "Learn more")}</a>`;
}

function renderSection(
  row: Record<string, unknown>,
  index: number,
  settings: StaticSiteSettings,
  template: StaticSiteTemplate
): string {
  const kind = str(row.kind);
  const heading = escapeHtml(row.heading);
  const body = str(row.body) === "" ? "" : `<p>${escapeHtml(row.body)}</p>`;
  const sectionNo = String(index + 1).padStart(2, "0");
  const label = (fallback: string) => {
    const text = template.layout.sectionLabels?.[kind as "hero" | "features" | "cta" | "text"] ?? fallback;
    return `<div class="section-label"><span>${sectionNo}</span>${escapeHtml(text)}</div>`;
  };

  switch (kind) {
    case "hero": {
      const img =
        str(row.imageUrl) === ""
          ? ""
          : `<img class="hero-img" src="${safeUrl(row.imageUrl)}" alt="${escapeHtml(
              row.heading
            )}" />`;
      return `<section class="s-hero${img ? " has-image" : ""}"><div class="hero-copy"><h1>${heading}</h1>${body}${renderCta(
        row,
        settings
      )}</div>${img}</section>`;
    }
    case "features":
      return `<section class="s-features">${label(
        "Capability"
      )}<div class="section-copy"><div><h2>${heading}</h2>${body}</div><div class="feature-card" aria-hidden="true"><span>Signal</span><strong>${sectionNo}</strong></div></div></section>`;
    case "cta":
      return `<section class="s-cta">${label("Release")}<div class="section-copy"><h2>${heading}</h2>${body}${renderCta(
        row,
        settings
      )}</div></section>`;
    case "text":
      return `<section class="s-text">${label("Control")}<div class="section-copy"><h2>${heading}</h2>${body}</div></section>`;
    default:
      // Unknown kind — skipped upstream; this is a defensive no-op.
      return "";
  }
}

const PAGE_STYLE = `
:root{--fg:oklch(0.15 0.018 250);--muted:oklch(0.45 0.025 250);--soft:oklch(0.965 0.006 250);--line:oklch(0.88 0.008 250);--line-strong:oklch(0.78 0.012 250);--accent:oklch(0.55 0.105 192);--accent-ink:oklch(0.2 0.045 210);--bg:oklch(0.985 0.004 250);--paper:oklch(1 0 0);--shadow:0 18px 48px oklch(0.15 0.018 250 / .11);--radius:12px}
*{box-sizing:border-box}
html{background:var(--bg);scroll-behavior:smooth}
body{margin:0;font:16px/1.62 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--fg);background:var(--bg);text-rendering:optimizeLegibility}
.site-shell{width:min(1120px,calc(100% - 40px));margin:0 auto}
.site-header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line)}
.site-header .site-shell{display:flex;align-items:center;justify-content:space-between;min-height:64px}
.brand{display:inline-flex;align-items:center;gap:10px;color:var(--fg);font-weight:760;text-decoration:none;letter-spacing:0}
.brand::before{content:"";width:11px;height:11px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 6px color-mix(in oklch,var(--accent) 16%,transparent)}
main.site-shell{padding:44px 0 56px}
section{position:relative}
h1,h2,p{margin:0}
h1{font-size:clamp(2.7rem,6vw,5rem);line-height:.96;font-weight:780;max-width:11ch;letter-spacing:0}
h2{font-size:clamp(1.55rem,2.3vw,2.25rem);line-height:1.05;font-weight:740;letter-spacing:0}
p{color:var(--muted);max-width:68ch}
.section-label{display:flex;align-items:center;gap:10px;font-size:.75rem;font-weight:760;line-height:1;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.section-label span{display:inline-grid;min-width:2.25rem;height:2.25rem;place-items:center;border:1px solid var(--line);border-radius:999px;background:var(--paper);color:var(--accent-ink);font:700 .72rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0}
.s-hero{min-height:min(660px,calc(100dvh - 220px));display:grid;align-items:center;padding:16px 0 52px;border-bottom:1px solid var(--line)}
.s-hero.has-image{grid-template-columns:minmax(0,.9fr) minmax(360px,1.1fr);gap:48px}
.hero-copy{min-width:0}
.hero-copy p{margin-top:22px;font-size:1.13rem;line-height:1.65;max-width:48rem}
.hero-img{width:100%;max-width:100%;aspect-ratio:4 / 3;object-fit:cover;border:1px solid var(--line-strong);border-radius:var(--radius);background:var(--soft);box-shadow:var(--shadow)}
.s-features,.s-text,.s-cta{display:grid;grid-template-columns:188px minmax(0,1fr);gap:32px;padding:40px 0;border-bottom:1px solid var(--line)}
.section-label{padding-top:4px}
.section-copy{min-width:0}
.section-copy p{margin-top:14px;font-size:1rem;line-height:1.7}
.s-features .section-copy{display:grid;grid-template-columns:minmax(0,.68fr) minmax(220px,.32fr);gap:28px;align-items:stretch}
.feature-card{display:flex;min-height:144px;flex-direction:column;justify-content:space-between;border:1px solid var(--line);border-radius:var(--radius);background:var(--paper);padding:18px;box-shadow:inset 0 -48px 0 var(--soft),0 1px 2px oklch(0.15 0.018 250 / .05)}
.feature-card span{color:var(--muted);font-size:.72rem;font-weight:760;letter-spacing:.08em;text-transform:uppercase}
.feature-card strong{align-self:flex-end;color:var(--accent);font:760 3.4rem/.85 ui-monospace,SFMono-Regular,Menlo,monospace}
.s-text .section-copy{padding:24px;border:1px solid var(--line);border-radius:var(--radius);background:var(--paper)}
.s-cta{margin-top:48px;padding:36px;border:1px solid var(--line-strong);border-radius:var(--radius);background:var(--paper);box-shadow:0 1px 2px oklch(0.15 0.018 250 / .05)}
.s-cta .section-copy{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px 28px;align-items:center}
.s-cta .section-copy p{grid-column:1}
.s-cta .cta{grid-column:2;grid-row:1 / span 2;margin-top:0}
.cta{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:.78rem 1.05rem;border:1px solid color-mix(in oklch,var(--accent) 84%,black);border-radius:8px;background:var(--accent);color:white;text-decoration:none;font-weight:700;box-shadow:0 8px 20px oklch(0.55 0.105 192 / .18);transition:transform .18s ease,box-shadow .18s ease}
.cta:hover{transform:translateY(-1px);box-shadow:0 12px 26px oklch(0.55 0.105 192 / .22)}
.cta:focus-visible{outline:3px solid color-mix(in oklch,var(--accent) 34%,white);outline-offset:3px}
.empty{margin-top:32px;padding:56px 24px;border:1px solid var(--line);border-radius:var(--radius);background:var(--paper);text-align:center}
.empty p{margin:0 auto;color:var(--muted)}
.site-footer{border-top:1px solid var(--line);padding:28px 0 36px;color:var(--muted);font-size:.86rem}
.site-footer .site-shell{display:flex;align-items:center;justify-content:space-between;gap:20px}
.site-footer a{color:var(--fg);font-weight:650;text-decoration:none}
.site-footer a:focus-visible{outline:3px solid color-mix(in oklch,var(--accent) 34%,white);outline-offset:3px}
body.theme-contrast{--fg:oklch(0.11 0.018 250);--muted:oklch(0.36 0.026 250);--bg:oklch(0.97 0.006 250);--paper:oklch(1 0 0);--line:oklch(0.76 0.014 250);--line-strong:oklch(0.62 0.018 250);--shadow:0 20px 56px oklch(0.12 0.018 250 / .14)}
body.theme-editorial{--fg:oklch(0.18 0.026 70);--muted:oklch(0.43 0.034 70);--bg:oklch(0.985 0.014 85);--soft:oklch(0.955 0.018 85);--line:oklch(0.86 0.018 80);--line-strong:oklch(0.74 0.026 80);--paper:oklch(1 0.006 85)}
body.accent-indigo{--accent:oklch(0.55 0.16 265);--accent-ink:oklch(0.22 0.065 265)}
body.accent-emerald{--accent:oklch(0.56 0.15 160);--accent-ink:oklch(0.22 0.055 160)}
body.accent-coral{--accent:oklch(0.62 0.17 25);--accent-ink:oklch(0.26 0.07 25)}
body.density-compact .site-header .site-shell{min-height:56px}
body.density-compact main.site-shell{padding:28px 0 40px}
body.density-compact .s-hero{min-height:min(560px,calc(100dvh - 200px));padding-bottom:36px}
body.density-compact .s-features,body.density-compact .s-text{padding:28px 0}
body.density-compact .s-cta{margin-top:32px;padding:28px}
body.hero-stacked .s-hero.has-image{display:flex;min-height:auto;flex-direction:column;align-items:stretch;gap:28px}
body.hero-stacked .hero-img{order:-1;aspect-ratio:16 / 9}
body.hero-text-first .s-hero.has-image{grid-template-columns:minmax(0,1.08fr) minmax(320px,.92fr);gap:36px}
body.hero-text-first h1{max-width:14ch}
body.sections-ruled .feature-card,body.sections-ruled .s-text .section-copy,body.sections-ruled .s-cta{box-shadow:none;background:transparent}
body.sections-banded .s-features,body.sections-banded .s-text{margin:28px 0;padding:32px;border:1px solid var(--line);border-radius:var(--radius);background:var(--soft)}
body.sections-banded .s-features .feature-card,body.sections-banded .s-text .section-copy{background:var(--paper)}
body.template-editorial-proof h1{font-family:Georgia,"Times New Roman",serif;font-weight:680;max-width:12ch}
body.template-editorial-proof .brand::before{border-radius:3px}
body.template-launch-system .s-features .feature-card{background:linear-gradient(180deg,var(--paper),var(--soft))}
body.template-launch-system .section-label span{border-radius:8px}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .cta{transition:none}
  .cta:hover{transform:none}
}
@media (max-width:860px){
  .site-shell{width:min(100% - 28px,1120px)}
  .site-header{position:static}
  .site-header .site-shell{min-height:60px}
  main.site-shell{padding:28px 0 48px}
  .s-hero,.s-hero.has-image{display:flex;min-height:auto;flex-direction:column;align-items:stretch;gap:28px;padding:12px 0 36px}
  .hero-img{order:-1;aspect-ratio:16 / 10}
  .s-features,.s-text,.s-cta{display:block;padding:32px 0}
  .section-label{margin-bottom:14px;padding-top:0}
  .s-features .section-copy{display:block}
  .feature-card{margin-top:22px;min-height:104px}
  .s-text .section-copy,.s-cta{padding:22px}
  .s-cta .section-copy{display:block}
  .s-cta .cta{margin-top:20px}
  .site-footer .site-shell{display:block}
  .site-footer a{display:inline-block;margin-top:8px}
}
@media (max-width:520px){
  h1{font-size:2.55rem}
  .brand{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .s-text .section-copy,.s-cta{padding:18px}
}
`.trim();

function bodyClass(settings: StaticSiteSettings, template: StaticSiteTemplate): string {
  return [
    template.layout.bodyClass ?? `template-${settings.templateId}`,
    `theme-${settings.theme}`,
    `density-${settings.density}`,
    `hero-${settings.heroLayout}`,
    `accent-${settings.accent}`,
    `sections-${settings.sectionStyle}`,
  ].join(" ");
}

function renderPage(
  title: string,
  sectionsHtml: string,
  settings: StaticSiteSettings,
  template: StaticSiteTemplate
): string {
  const inner =
    sectionsHtml.trim() === ""
      ? `<section class="empty"><p>No content yet.</p></section>`
      : sectionsHtml;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body class="${bodyClass(settings, template)}">
<header class="site-header">
  <div class="site-shell">
    <a class="brand" href="#content">${escapeHtml(title)}</a>
  </div>
</header>
<main id="content" class="site-shell">
${inner}
</main>
<footer class="site-footer">
  <div class="site-shell">
    <span>${escapeHtml(title)}</span>
    <a href="#content">Back to top</a>
  </div>
</footer>
</body>
</html>
`;
}

export const staticSiteGenerator: GeneratorAdapter = {
  generatorType: "static-site",

  async generate(rows, config): Promise<Artifact> {
    const title = str(config?.siteTitle) || "Untitled site";
    const settings = parseStaticSiteSettings(config?.staticSiteSettings);
    const template = getStaticSiteTemplate(settings.templateId);
    assertTemplateSupportsSettings(template, settings);
    const supportedKinds = new Set<string>(template.supportedSectionKinds);

    // Fail-safe draft gate + unknown-kind skip, then stable ascending order.
    const published = rows
      .filter((r) => str(r.status) === "published")
      .filter((r) => KNOWN_KINDS.has(str(r.kind)))
      .filter((r) => supportedKinds.has(str(r.kind)))
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const d = orderOf(a.r) - orderOf(b.r);
        return d !== 0 ? d : a.i - b.i; // stable tie-break by input index
      })
      .map(({ r }) => r);

    const sectionsHtml = published.map((r, i) => renderSection(r, i, settings, template)).join("\n");
    const content = renderPage(title, sectionsHtml, settings, template);
    const hash = createHash("sha256").update(content).digest("hex");

    return {
      files: [{ path: "index.html", content }],
      entryPoint: "index.html",
      hash,
    };
  },
};
