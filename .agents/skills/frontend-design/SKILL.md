---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

## Project Context

When building within an existing project, read its design system first:
- Check for `design-system/MASTER.md` — if it exists, its tokens, forbidden patterns, and component conventions override the generic guidelines below
- Check `src/components/shared/` for existing shared components to reuse (PageShell, StatusChip, FilterBar, etc.)
- Check `src/components/ui/` for the project's shadcn/ui component library
- Check `design-system/tokens.json` for forbidden patterns that must not appear in new code

For ainative: The "Calm Ops" design system uses opaque surfaces, border-centric elevation (elevation-0 through elevation-3), OKLCH hue ~250, Inter + JetBrains Mono, and minimal functional animations. Creative flourishes like glassmorphism, gradient meshes, noise textures, and grain overlays are explicitly forbidden. See `references/design-decisions.md` in the frontend-designer skill for the full decision catalog.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts intentionally. Avoid lazy defaults (Arial, Times New Roman, system-ui). Even "common" fonts like Inter or Roboto are excellent choices when selected for specific reasons (e.g., Inter's small-text legibility for dense operational UIs). For creative projects, opt for distinctive, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth. For greenfield creative projects: gradient meshes, noise textures, geometric patterns, dramatic shadows, decorative borders, and grain overlays. For existing design systems: check `design-system/MASTER.md` for forbidden patterns first — many operational UIs deliberately avoid transparency, gradients, and decorative effects in favor of opaque surfaces and border-centric elevation.

NEVER use generic AI-generated aesthetics like default system fonts without intentional choice (Arial, Helvetica, system-ui as a lazy default), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Codex is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
