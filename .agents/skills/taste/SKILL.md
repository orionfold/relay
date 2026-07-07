---
name: taste
description: Engineering guardrails for premium frontend interfaces — enforces specific typography stacks, color constraints, animation performance rules, forbidden pattern replacements, and tunable design metrics. Companion to the frontend-design skill (which handles creative direction). Use this skill whenever the user is building, refining, or reviewing frontend UI code, working with Tailwind CSS, optimizing animation performance, enforcing design system consistency, or asking for frontend code review. Co-triggers with frontend-design for new UI builds; triggers solo for Tailwind work, animation tuning, design system enforcement, and frontend code quality checks.
---

# Frontend Taste: Engineering Guardrails

This skill enforces quantitative design rules and implementation discipline for premium frontend interfaces. It complements the `frontend-design` skill (creative vision) with engineering constraints.

## Project Override

When working in a project with `design-system/MASTER.md`, read it first — its tokens and constraints override the generic defaults below. For ainative specifically:

- **Design Metrics:** DV 3-4, MI 2-3, VD 6-7 (overrides generic defaults below)
- **Typography:** Inter (body) + JetBrains Mono (code) — overrides the generic font list
- **Icons:** Lucide React (h-4 w-4 inline, h-5 w-5 lists, h-12 w-12 hero) — overrides generic icon library guidance
- **Color:** OKLCH hue ~250, semantic status tokens — see `design-system/tokens.json`
- **Surfaces:** Opaque, border-centric elevation (elevation-0 through elevation-3) — no glass, no backdrop-filter
- **Forbidden patterns:** Read from `design-system/tokens.json` → `forbidden.patterns[]`

When `MASTER.md` exists, the rules below apply EXCEPT where overridden above.

## Design Metrics

Three tunable parameters drive all conditional rules. Adjust per user request.

| Metric | Default | Scale |
|--------|---------|-------|
| `DESIGN_VARIANCE` | 5 | 1 = Perfect Symmetry → 10 = Artsy Chaos |
| `MOTION_INTENSITY` | 4 | 1 = Static → 10 = Cinematic Physics |
| `VISUAL_DENSITY` | 5 | 1 = Art Gallery Airy → 10 = Cockpit Packed |

Projects with `design-system/MASTER.md` override these defaults — check the Project Override section above.

## Foundation

### Dependency Verification [MANDATORY]
Before importing ANY third-party library, check `package.json`. If missing, output the install command before providing code. Never assume a library exists.

### Tailwind Version Lock
Check `package.json` first. Do not use v4 syntax in v3 projects. For v4, do NOT use `tailwindcss` plugin in `postcss.config.js` — use `@tailwindcss/postcss` or the Vite plugin.

### RSC Safety
- Global state works ONLY in Client Components
- In Next.js, wrap providers in a `"use client"` component
- Interactive/animated components must be extracted as isolated leaf components with `'use client'` at top
- Server Components render static layouts exclusively

## Accessibility [MANDATORY]

Target **WCAG AA minimum**, AAA for text contrast where feasible.

| Requirement | Rule |
|-------------|------|
| Text contrast | 4.5:1 minimum (AA), 7:1 preferred (AAA) |
| Large text / UI components | 3:1 minimum contrast ratio |
| Reduced motion | Wrap all animations in `@media (prefers-reduced-motion: no-preference)`. Provide instant fallback |
| Focus visibility | `focus-visible:ring-2 focus-visible:ring-offset-2` on ALL interactive elements. Never remove focus outlines |
| Semantic HTML | Use landmarks (`<main>`, `<nav>`, `<aside>`), proper heading hierarchy (no skipped levels), `<button>` not `<div onClick>` |
| Screen readers | `aria-label` on icon-only buttons, `sr-only` labels where visual label absent, `aria-live` for dynamic content |
| Touch targets | Minimum 44x44px on mobile interactive elements |

### ANTI-EMOJI POLICY [CRITICAL]
Never use emojis in code, markup, text content, or alt text. Replace with icons (Radix, Phosphor) or clean SVG primitives.

### Icon Libraries
Check the project's existing icon library first (grep for import patterns). Common choices: Lucide React, `@phosphor-icons/react`, `@radix-ui/react-icons`. Do not mix libraries — use whichever the project already uses. Standardize `strokeWidth` globally (1.5 or 2.0 exclusively).

## Typography Stack

**Approved fonts:** Inter, Outfit, Cabinet Grotesk, Satoshi, Clash Display, Neue Machina, Plus Jakarta Sans
**Monospace:** JetBrains Mono, Geist Mono, Space Mono
**Note:** Font preferences are project-specific. Check `design-system/MASTER.md` for the project's chosen fonts before applying this list. Inter is excellent for dense operational UIs; creative/marketing projects may prefer more distinctive choices.
**Serif:** Banned for Dashboard/Software UIs; permitted only for creative/editorial contexts

**Scale defaults:**
- Display/Headlines: `text-4xl md:text-6xl tracking-tighter leading-none`
- Body: `text-base text-gray-600 leading-relaxed max-w-[65ch]`

## Color Rules

- **Max 1 accent color.** Saturation < 80%.
- **THE LILA BAN:** AI Purple/Blue aesthetic is strictly banned.
- **One palette per project.** Do not mix warm and cool grays.
- **Prefer OKLCH/HSL over hex.** OKLCH is perceptually uniform — use `oklch()` for theme tokens and dynamic palette generation. HSL acceptable. Avoid raw hex for non-trivial palettes.

| Forbidden | Replacement |
|-----------|-------------|
| Pure Black `#000000` | Zinc-950, Off-Black, Charcoal |
| AI Purple/Blue | Emerald, Electric Blue, Deep Rose |
| Neon/Outer Glows (default `box-shadow`) | Inner borders or subtle tinted shadows |
| Oversaturated accents | Desaturate below 80% saturation |
| Excessive gradient text | Avoid `text-fill` gradients on large headers |
| Raw hex for theme colors | OKLCH tokens: `--accent: oklch(0.65 0.2 250)` |

**Base neutrals:** Zinc, Slate

**Dark mode structure:** Define CSS custom properties with OKLCH values on `:root` and `.dark` selectors. Never hard-code light/dark colors inline — always reference variables.

## Layout Rules

### Variance-Conditional Behavior

**DESIGN_VARIANCE 1-3 (Predictable):** Flexbox `justify-center`, strict 12-column symmetrical grids, equal paddings.

**DESIGN_VARIANCE 4-7 (Offset):** Overlapping margins (`margin-top: -2rem`), varied image aspect ratios, left-aligned headers over center-aligned data.

**DESIGN_VARIANCE 8-10 (Asymmetric):** Masonry layouts, CSS Grid fractional units (`grid-template-columns: 2fr 1fr 1fr`), massive empty zones (`padding-left: 20vw`).

### Anti-Card-Overuse
Omit cards in favor of spacing where possible. Avoid 3-column card layouts — use zig-zag, asymmetric grid, or horizontal scroll instead.

### Layout Containment
Use `max-w-[1400px] mx-auto` or `max-w-7xl`.

### Z-Index Restraint
Never spam arbitrary `z-50` or `z-10`. Use z-indexes strictly for systemic layers: sticky navbars, modals, overlays.

## Forbidden Patterns

| Forbidden | Replacement |
|-----------|-------------|
| Custom mouse cursors | Default cursor (performance/a11y) |
| Oversized H1s | Control hierarchy via weight/color, not scale |
| Generic names ("John Doe", "Sarah Chan") | Creative, realistic-sounding names |
| Generic avatars (Lucide user icons) | Creative photo placeholders or styled initials |
| Fake round numbers (99.99%, 50%) | Organic data (47.2%, messy values) |
| Startup slop ("Acme", "Nexus", "SmartFlow") | Premium, contextual brand names |
| Filler copy ("Elevate", "Seamless", "Unleash") | Concrete verbs |
| Broken Unsplash links | `https://picsum.photos/seed/{random}/800/600` |

## Image Strategy

### Placeholders & Sources
- **Preferred placeholder:** `https://picsum.photos/seed/{descriptive}/W/H` — reliable, no API key, deterministic with seed
- **Project assets:** prefer local `/public/images/` over external URLs when assets exist
- **Never hardcode Unsplash/Pexels URLs** — they break over time. Use their APIs or local assets

### Performance Rules [NON-NEGOTIABLE]
- `loading="lazy"` on all below-fold images
- `priority` prop (Next.js `<Image>`) on hero/above-fold images
- Explicit `width` and `height` attributes OR `aspect-ratio` CSS — never allow layout shift (CLS)
- Use Next.js `<Image>` component over `<img>` in Next.js projects — automatic optimization, WebP/AVIF, responsive srcset

### AI Image Prompts
When a design requires custom imagery beyond placeholders, include a generation prompt:

```
[IMAGE PROMPT START]
Subject: [description]
Style: [photographic | illustration | 3D render | abstract]
Mood: [warm | cold | dramatic | minimal]
Aspect: [16:9 | 1:1 | 4:3]
[IMAGE PROMPT END]
```

This signals to the user where AI-generated or stock imagery should be sourced.

## Interactive States

Implement ALL states for every data-driven component:

- **Loading:** Skeletal loaders matching layout sizes. No generic circular spinners.
- **Empty:** Beautifully composed empty states showing how to populate data.
- **Error:** Clear inline error reporting.
- **Tactile feedback:** On `:active`, use `-translate-y-[1px]` or `scale-[0.98]` for physical push feel.

### Form Patterns
- Label MUST sit above input
- Helper text: optional but present in markup
- Error text: below input
- Standard spacing: `gap-2` for input blocks

## Animation Performance

### GPU-Only Properties [NON-NEGOTIABLE]
Never animate `top`, `left`, `width`, or `height`. Animate exclusively via `transform` and `opacity`.

### Motion Intensity Routing

| MOTION_INTENSITY | Allowed | Library |
|------------------|---------|---------|
| 1-3 | CSS `:hover` and `:active` states only | Native CSS |
| 4-7 | `transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1)` | CSS only |
| 8-10 | Scroll-triggered reveals, parallax, spring physics | Framer Motion / GSAP / Three.js |

### Library Boundaries
- Never mix GSAP/Three.js with Framer Motion in the same component tree
- GSAP/Three.js: exclusively for isolated full-page scrolltelling or canvas backgrounds, wrapped in strict `useEffect` cleanup
- Framer Motion magnetic hover: use `useMotionValue` and `useTransform` exclusively — never `useState`
- Layout transitions: use Framer Motion `layout` and `layoutId` props

### Memoization Rule
Any perpetual motion or infinite animation MUST be `React.memo`'d and isolated in its own Client Component. Never trigger parent re-renders.

### Perpetual Motion (MOTION_INTENSITY > 5)
Embed continuous infinite micro-animations in standard components: pulse, typewriter, float, shimmer, carousel.

### Spring Physics
Default: `type: "spring", stiffness: 100, damping: 20`
Stagger: `staggerChildren` (Framer) or `animation-delay: calc(var(--index) * 100ms)` (CSS)

## Mobile Safety

### Viewport [CRITICAL]
NEVER use `h-screen` for full-height sections. ALWAYS use `min-h-[100dvh]` to prevent layout collapse on iOS Safari.

### Grid Over Flex-Math
Never use `w-[calc(33%-1rem)]`. Use CSS Grid: `grid grid-cols-1 md:grid-cols-3 gap-6`.

### High-Variance Fallback
Above `md:` breakpoint: asymmetric layouts permitted. Below 768px: aggressively collapse to single-column (`w-full`, `px-4`, `py-8`).

### DOM Performance
Apply grain/noise filters exclusively to `fixed inset-0 z-50 pointer-events-none` pseudo-elements — never to scrolling containers.

## Advanced Patterns

Reference catalog for high-impact implementations when appropriate:

**Bento Grid 2.0:** Background `#f9fafb`, cards `#ffffff` with `border-slate-200/50`, `rounded-[2.5rem]`, `shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]`, `p-8`/`p-10`. Titles/descriptions outside and below cards.

**Opaque Elevation:** For projects using border-centric elevation (check `design-system/MASTER.md`), use `elevation-0` through `elevation-3` utility classes with opaque surfaces instead of glass or shadow-heavy patterns. For creative/greenfield projects without a design system, glassmorphism is acceptable: `border-white/10` + `shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`.

**Scroll patterns:** Sticky scroll stack, horizontal scroll hijack, zoom parallax, scroll progress SVG auto-draw.

**Typography effects:** Kinetic marquee, text mask reveal, text scramble (Matrix decode), circular text path.

**Micro-interactions:** Particle explosion button, directional hover-aware button, ripple click from coordinates, animated SVG line drawing, mesh gradient background.

## Pre-Flight Checklist

Before shipping, verify:

- [ ] `package.json` checked — all imports verified
- [ ] Mobile layout collapse guaranteed (`w-full`, `px-4`, `max-w-7xl mx-auto`)
- [ ] Full-height sections use `min-h-[100dvh]`, not `h-screen`
- [ ] `useEffect` animations have cleanup functions
- [ ] Empty, loading, and error states implemented
- [ ] Cards omitted in favor of spacing where possible
- [ ] CPU-heavy animations isolated in own Client Components
- [ ] No emojis anywhere in output
- [ ] Global state not used for prop-drilling avoidance without cause
- [ ] Single accent color, saturation < 80%, no purple/neon
- [ ] Focus-visible styles on all interactive elements
- [ ] `prefers-reduced-motion` respected for all animations
- [ ] Images have explicit dimensions or aspect-ratio (no CLS)
- [ ] Below-fold images use `loading="lazy"`
- [ ] Color contrast meets WCAG AA (4.5:1 text, 3:1 UI)
- [ ] If `design-system/tokens.json` exists, run `npx tsx design-system/validate-tokens.ts`
- [ ] No forbidden patterns from `tokens.json` present in new code
