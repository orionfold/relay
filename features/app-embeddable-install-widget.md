---
title: App Embeddable Install Widget
status: dropped
dropped: "Not pursuing — app distribution/marketplace ambition cut per _IDEAS/reprioritze.md §4 (concentration cutline, 2026-06-29)."
priority: P3
milestone: post-mvp
source: brainstorm session 2026-04-11
dependencies: [marketplace-app-listing]
---

# App Embeddable Install Widget

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

App creators and bloggers need a way to link directly to ainative app installs
from external websites. This feature provides "Install on ainative" badges and
buttons that can be embedded in READMEs, blog posts, documentation sites, and
landing pages — similar to "Deploy to Heroku" or "Open in Colab" badges.

The widget links to a deep URL that opens the ainative marketplace install flow
directly for the specified app, skipping the browse/search step.

## User Story

As an app creator, I want to embed an "Install on ainative" badge on my GitHub
README and blog, so users can install my app with one click without having to
search the marketplace.

As a ainative user, I want to click an install badge on a blog post and land
directly on the app's install confirmation dialog, so I can evaluate and
install the app without friction.

## Technical Approach

### 1. Deep-Link URL Scheme

Two URL patterns for maximum compatibility:

**Web URL (primary):**
```
https://orionfold.com/relay/install/{app-id}
```
- Works everywhere (browsers, GitHub READMEs, email)
- Redirects to `/marketplace/apps/{app-id}?action=install` on the user's
  local ainative instance
- If ainative is not running locally, shows a landing page with download
  instructions

**Custom protocol (future):**
```
ainative://install/{app-id}
```
- Registered via Electron or system URL handler (when ainative ships as
  desktop app)
- Opens ainative directly and triggers install flow
- Fallback to web URL if protocol handler not registered

V1 implements the web URL only. The custom protocol is a future enhancement
when ainative ships as a packaged desktop application.

### 2. Install Landing Route

New route: `/install/[appId]/page.tsx`

Behavior:
1. Fetch app metadata from marketplace
2. If app exists: redirect to `/marketplace/apps/{appId}?action=install`
3. The marketplace detail page detects `?action=install` and auto-opens
   the install confirmation dialog
4. If app not found: show "App not found" error with link to marketplace

### 3. Badge Variants

Four badge styles, each available in dark and light themes:

**Standard badge:**
```
┌──────────────────────────┐
│  ⬇ Install on ainative    │
└──────────────────────────┘
```

**Badge with install count:**
```
┌──────────────────────────────────┐
│  ⬇ Install on ainative  |  1.2k  │
└──────────────────────────────────┘
```

**Minimal badge (for inline use):**
```
[Install on ainative]
```

**Shield.io compatible:**
```
https://img.shields.io/badge/Install%20on-ainative-blue?logo=data:...
```

Badges are SVG for crisp rendering at any size. The install count variant
fetches the count dynamically via a badge endpoint.

### 4. Badge Endpoint

`GET /api/badges/[appId]`

Query params:
- `style`: `standard` | `with-count` | `minimal` | `shield` (default: standard)
- `theme`: `dark` | `light` (default: dark)

Returns: SVG image with appropriate `Content-Type: image/svg+xml` and
`Cache-Control: public, max-age=3600` (1-hour cache for install count).

### 5. HTML Snippet Generator

In the creator portal (from `creator-portal`), each published app gets a
"Get Install Badge" section:

```
Embed this badge on your website:

[Preview of badge]

HTML:
<a href="https://orionfold.com/relay/install/wealth-manager">
  <img src="https://orionfold.com/relay/api/badges/wealth-manager"
       alt="Install on ainative" height="32" />
</a>

Markdown:
[![Install on ainative](https://orionfold.com/relay/api/badges/wealth-manager)](https://orionfold.com/relay/install/wealth-manager)

Theme: [Dark] [Light]
Style: [Standard] [With Count] [Minimal]
```

Copy-to-clipboard button for each snippet variant.

### 6. Analytics

Badge impressions and click-throughs tracked for creator analytics:

- Badge endpoint logs impression (rate-limited, 1 per IP per hour per app)
- Install landing page logs click-through
- Data available in creator portal analytics tab

## Acceptance Criteria

- [ ] `/install/{appId}` route redirects to marketplace detail with install
      dialog auto-opened.
- [ ] Badge endpoint returns SVG for all four styles in dark and light themes.
- [ ] Badge with install count shows current count from marketplace.
- [ ] HTML snippet generator in creator portal with copy-to-clipboard.
- [ ] Markdown badge renders correctly on GitHub READMEs.
- [ ] 404 handling: unknown app ID shows helpful error page.
- [ ] Badge SVG is cached (1-hour TTL) for performance.
- [ ] Badge impressions logged for creator analytics.

## Scope Boundaries

**Included:**
- Web URL deep-link scheme (`/install/{appId}`)
- SVG badge endpoint with 4 styles and 2 themes
- HTML/Markdown snippet generator in creator portal
- Install landing route with auto-open dialog
- Basic impression analytics

**Excluded:**
- Custom protocol handler (`ainative://`) — requires desktop app packaging
- JavaScript embed widget (iframe-based) — future enhancement
- QR code generation for badges
- A/B testing badge variants

## References

- Source: brainstorm session 2026-04-11, plan §6f
- Related: `marketplace-app-listing` (install dialog),
  `creator-portal` (snippet generator placement),
  `marketplace-app-publishing` (app metadata)
- Files to create:
  - `src/app/install/[appId]/page.tsx` — install landing route
  - `src/app/api/badges/[appId]/route.ts` — SVG badge endpoint
  - `src/lib/marketplace/badges.ts` — badge SVG generation
  - `src/components/marketplace/badge-snippet-generator.tsx`
- Files to modify:
  - `src/app/marketplace/apps/[id]/page.tsx` — handle `?action=install` param
