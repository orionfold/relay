---
title: Telemetry rail carousel controls
status: in-progress
priority: P2
milestone: post-mvp
source: _IDEAS/backlog.md G-046; _IDEAS/triage.md TRIAGE-013
dependencies: [app-shell, micro-visualizations]
---

# Telemetry rail carousel controls

## Outcome

When Relay's fixed ten-cell telemetry rail overflows, visible Previous and Next
controls bring clipped cards fully into view without replacing native horizontal
scrolling or hiding operational signals.

## What already exists

- The rail is sticky chrome with ten frozen `RailCell` entries and a live/stale
  status foot.
- The rail already supports wheel, trackpad, touch, and scrollbar navigation.
- The Kanban board already measures horizontal overflow and exposes local
  Previous/Next controls, establishing the interaction vocabulary.
- Shared icon buttons provide focus rings, disabled state, tooltips through
  accessible names, and semantic hover tokens.

## Design and technical approach

Use slim rail-contained edge gutters. Overlay buttons were rejected because
they can obscure telemetry content; a separate header was rejected because it
changes the frozen rail geometry.

```text
no overflow:  [ card ][ card ][ card ][ status ]
overflow:   [‹][ card ][ card ][ clipped… ][›]
start:      [ ][ visible cards ……………………][›]
middle:     [‹][ visible cards ……………………][›]
end:        [‹][ …………………… visible cards ][ ]
```

- Measure intrinsic content overflow against the outer rail width so mounted
  control gutters cannot keep themselves visible after content would fit.
- Measure `clientWidth` and `scrollLeft` inside the scroll region with a small
  epsilon for directional control state.
- Recompute on scroll, window resize, and observed rail/child resize.
- Keep the fixed cards and status inside one native overflow region.
- Move to the adjacent clipped card; clamp to the legal scroll range.
- Use subtle native smooth scrolling normally and immediate scrolling for
  reduced motion. Edge controls use color-only hover feedback without scale or
  arrival animation.
- Hide the native scrollbar chrome without removing wheel, trackpad, touch, or
  programmatic scrolling.
- Reserve both compact edge gutters for the full overflow session so the
  viewport never jumps when direction state changes. Render the full-height
  button hit target inside a gutter only while that direction is useful.

## Acceptance criteria

- [ ] Controls are absent when rail content fits, including the exact boundary.
- [ ] The useful directional control appears when overflow exceeds the
  measurement epsilon; unavailable directions stay absent.
- [ ] Only Next appears at the start, both controls work in the middle, and only
  Previous appears at the end.
- [ ] A control activation brings the adjacent clipped telemetry card fully into
  view and never scrolls past the legal range.
- [ ] Resize and content-width changes recompute control visibility and state.
- [ ] Native wheel, trackpad, and touch navigation remain available.
- [ ] Native scrolling remains available while the horizontal scrollbar chrome
  is hidden.
- [ ] Full-height edge-gutter buttons have stable accessible names, clear hover
  and keyboard focus treatment, without layout or scale motion.
- [ ] Reduced-motion mode uses immediate rather than smooth scrolling.
- [ ] Browser checks pass at the exact boundary, 944px, adjacent widths, light
  and dark themes, with no page-level horizontal overflow or covered card text.

## Error & Rescue Registry

| Failure | Impact | Rescue |
|---------|--------|--------|
| `ResizeObserver` unavailable | controls may not react to child resize | retain initial measurement plus window-resize and scroll updates |
| subpixel layout drift | controls flicker at an exact fit | use a two-pixel overflow/end epsilon |
| mounted gutters create false overflow | controls remain after the rail would otherwise fit | calculate overflow from intrinsic content versus outer rail width |
| smooth scroll still in flight | end state updates late | update on every native scroll event and once after activation |
| directional button state changes | rail viewport jumps as a button mounts or unmounts | reserve fixed gutters on both edges for the whole overflow session |
| card geometry unavailable | adjacent target cannot be derived | fall back to a clamped 75% viewport step |
| narrow viewport | gutters reduce visible rail width | keep gutters compact and native scroll region `min-width: 0` |
| reduced motion requested | animated movement causes discomfort | use `behavior: auto` |

## NOT in scope

- Adding, removing, reordering, or redesigning the frozen ten telemetry cells.
- Replacing native horizontal scrolling, adding autoplay, pagination dots, or
  drag-only behavior. Hiding scrollbar chrome does not remove scrolling.
- Moving the rail, changing its sticky offset, or expanding live-host metrics.
- Redesigning the Kanban board's separate scroll controls.
