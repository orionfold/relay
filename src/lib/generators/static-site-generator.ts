import { createHash } from "crypto";
import type { GeneratorAdapter } from "./types";
import type { Artifact } from "@/lib/publishers/types";

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

function renderCta(row: Record<string, unknown>): string {
  const label = str(row.ctaLabel);
  const url = str(row.ctaUrl);
  if (label === "" && url === "") return "";
  return `<a class="cta" href="${safeUrl(url)}">${escapeHtml(label || "Learn more")}</a>`;
}

function renderSection(row: Record<string, unknown>): string {
  const kind = str(row.kind);
  const heading = escapeHtml(row.heading);
  const body = str(row.body) === "" ? "" : `<p>${escapeHtml(row.body)}</p>`;

  switch (kind) {
    case "hero": {
      const img =
        str(row.imageUrl) === ""
          ? ""
          : `<img class="hero-img" src="${safeUrl(row.imageUrl)}" alt="${escapeHtml(
              row.heading
            )}" />`;
      return `<section class="s-hero">${img}<h1>${heading}</h1>${body}${renderCta(
        row
      )}</section>`;
    }
    case "features":
      return `<section class="s-features"><h2>${heading}</h2>${body}</section>`;
    case "cta":
      return `<section class="s-cta"><h2>${heading}</h2>${body}${renderCta(
        row
      )}</section>`;
    case "text":
      return `<section class="s-text"><h2>${heading}</h2>${body}</section>`;
    default:
      // Unknown kind — skipped upstream; this is a defensive no-op.
      return "";
  }
}

const PAGE_STYLE = `
:root{--fg:#111;--muted:#555;--accent:#2563eb;--bg:#fff}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,sans-serif;color:var(--fg);background:var(--bg)}
main{max-width:820px;margin:0 auto;padding:2rem 1.25rem}
section{padding:2.5rem 0;border-bottom:1px solid #eee}
h1{font-size:2.4rem;margin:.2em 0}h2{font-size:1.6rem;margin:.2em 0}
p{color:var(--muted)}
.hero-img{max-width:100%;border-radius:12px;margin-bottom:1rem}
.cta{display:inline-block;margin-top:1rem;padding:.7rem 1.3rem;background:var(--accent);color:#fff;text-decoration:none;border-radius:8px}
.empty{color:var(--muted);text-align:center;padding:4rem 0}
`.trim();

function renderPage(title: string, sectionsHtml: string): string {
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
<body>
<main>
${inner}
</main>
</body>
</html>
`;
}

export const staticSiteGenerator: GeneratorAdapter = {
  generatorType: "static-site",

  async generate(rows, config): Promise<Artifact> {
    const title = str(config?.siteTitle) || "Untitled site";

    // Fail-safe draft gate + unknown-kind skip, then stable ascending order.
    const published = rows
      .filter((r) => str(r.status) === "published")
      .filter((r) => KNOWN_KINDS.has(str(r.kind)))
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const d = orderOf(a.r) - orderOf(b.r);
        return d !== 0 ? d : a.i - b.i; // stable tie-break by input index
      })
      .map(({ r }) => r);

    const sectionsHtml = published.map(renderSection).join("\n");
    const content = renderPage(title, sectionsHtml);
    const hash = createHash("sha256").update(content).digest("hex");

    return {
      files: [{ path: "index.html", content }],
      entryPoint: "index.html",
      hash,
    };
  },
};
