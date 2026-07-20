import mark24 from "../../../public/brand/orionfold-mark-24.png";
import mark28 from "../../../public/brand/orionfold-mark-28.png";
import mark48 from "../../../public/brand/orionfold-mark-48.png";
import mark56 from "../../../public/brand/orionfold-mark-56.png";
import mark72 from "../../../public/brand/orionfold-mark-72.png";
import mark144 from "../../../public/brand/orionfold-mark-144.png";
import type { StaticImageData } from "next/image";

interface OfMarkProps {
  /** Pixel size of the square mark. */
  size?: number;
  className?: string;
}

/**
 * OfMark — the Orionfold delta-star brand mark.
 *
 * The 3D origami star on a Tide-cyan disc, served from the design-system's
 * native app-embed renders (`/public/brand/orionfold-mark-*.png`). Static
 * imports make Next include the files in the prebuilt release bundle instead
 * of depending on the process working directory to expose `/public`. The disc is
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
  if (size <= 24) return { src: assetSrc(mark24), src2x: assetSrc(mark48) };
  if (size <= 28) return { src: assetSrc(mark28), src2x: assetSrc(mark56) };
  if (size <= 72) return { src: assetSrc(mark72), src2x: assetSrc(mark144) };
  return { src: assetSrc(mark144), src2x: assetSrc(mark144) };
}

function assetSrc(asset: StaticImageData | string): string {
  return typeof asset === "string" ? asset : asset.src;
}
