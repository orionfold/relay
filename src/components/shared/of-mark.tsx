interface OfMarkProps {
  /** Pixel size of the square mark. */
  size?: number;
  className?: string;
}

/**
 * OfMark — the Orionfold delta-star brand mark.
 *
 * The 3D origami star on a Tide-cyan disc, served from the design-system's
 * native app-embed renders (`/public/brand/orionfold-mark-*.png`). The disc is
 * opaque and self-contained, so a single transparent variant reads correctly on
 * any theme background — no light/dark switch needed. Canonical mark at every
 * size: nav/app-bar brand, wordmark lockup, boot splash, seals.
 *
 * Each placement ships a 1×/2× pair rendered at that exact size (not downscaled
 * at runtime), wired via `srcset` so retina stays crisp with no server
 * re-encoding — the browser paints the design-system pixels 1:1. Replaces the
 * earlier flat theme-aware SVG (cyan disc + white vector star).
 */
export function OfMark({ size = 24, className }: OfMarkProps) {
  const { src, src2x } = markAssets(size);
  return (
    <img
      src={src}
      srcSet={`${src} 1x, ${src2x} 2x`}
      width={size}
      height={size}
      alt="Orionfold"
      className={className}
    />
  );
}

/**
 * Map a display size to its native 1×/2× asset pair. The design system renders
 * the mark at the three sizes the app embeds (24 rail, 28 wordmark, 72 boot);
 * for any other size we serve the 144px master downscaled by the browser.
 */
function markAssets(size: number): { src: string; src2x: string } {
  const base = "/brand/orionfold-mark-";
  if (size <= 24) return { src: `${base}24.png`, src2x: `${base}48.png` };
  if (size <= 28) return { src: `${base}28.png`, src2x: `${base}56.png` };
  if (size <= 72) return { src: `${base}72.png`, src2x: `${base}144.png` };
  return { src: `${base}144.png`, src2x: `${base}144.png` };
}
