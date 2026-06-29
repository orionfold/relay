/**
 * Generate the Orionfold Relay brand icon set (favicon + PWA + apple-touch)
 * from the OfMark geometry (cyan disc + white star), rasterized via sharp.
 *
 * "Disc fills the frame": the cyan disc spans the full square edge-to-edge with
 * the white star centered on it — matching the in-app OfMark and staying legible
 * down to a 16px browser-tab glyph. The maskable variant uses the same fill, so
 * Android's adaptive circle crop is always safe (the disc IS the safe zone).
 *
 * The disc color is the baked sRGB hex of the brand token --primary
 * (oklch(0.62 0.11 192) → #009b97); rasters have no CSS so the theme value is
 * inlined here rather than referenced as var(--primary).
 *
 * Run: npx tsx scripts/generate-brand-icons.ts
 * Outputs into public/. Regenerate whenever the mark or brand cyan changes.
 */
import sharp from "sharp";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

const PUBLIC_DIR = join(process.cwd(), "public");

// Baked brand cyan (= --primary light, oklch(0.62 0.11 192)). Keep in sync with
// src/app/globals.css and src/components/shared/of-mark.tsx.
const DISC = "#009b97";
const STAR = "#ffffff";

// The OfMark star path is authored in a 64-unit box with the disc at r=32. We
// render the disc edge-to-edge at the target size and scale the star group to
// match, so the proportions track the in-app SVG exactly.
function markSvg(size: number): string {
  const r = size / 2;
  // Scale factor from the authored 64-box to this size.
  const k = size / 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <circle cx="${r}" cy="${r}" r="${r}" fill="${DISC}"/>
  <g transform="translate(${r} ${r}) rotate(45) scale(${k}) translate(-32 -32)">
    <path fill="${STAR}" d="M32,9L37.41,24.56L53.88,24.89L40.75,34.84L45.52,50.61L32,41.2L18.48,50.61L23.25,34.84L10.12,24.89L26.59,24.56Z"/>
  </g>
</svg>`;
}

async function renderPng(size: number, outName: string): Promise<void> {
  const buf = await sharp(Buffer.from(markSvg(size)))
    .png()
    .toBuffer();
  writeFileSync(join(PUBLIC_DIR, outName), buf);
  console.log(`  ✓ ${outName} (${size}×${size})`);
}

// A minimal ICO container holding multiple PNG-encoded images (favicon.ico
// supports embedded PNGs since all modern browsers). Builds the 6-byte header +
// one 16-byte directory entry per image, then the PNG payloads.
function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const payloads: Buffer[] = [];
  images.forEach((img, i) => {
    const d = dir.subarray(i * 16, i * 16 + 16);
    d.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // width (0 = 256)
    d.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // height
    d.writeUInt8(0, 2); // palette
    d.writeUInt8(0, 3); // reserved
    d.writeUInt16LE(1, 4); // color planes
    d.writeUInt16LE(32, 6); // bits per pixel
    d.writeUInt32LE(img.png.length, 8); // size of payload
    d.writeUInt32LE(offset, 12); // offset
    offset += img.png.length;
    payloads.push(img.png);
  });

  return Buffer.concat([header, dir, ...payloads]);
}

async function main(): Promise<void> {
  console.log("Generating Orionfold Relay brand icons…");

  // Standard PNGs (full-bleed disc).
  await renderPng(16, "icon-16.png");
  await renderPng(32, "icon-32.png");
  await renderPng(48, "icon-48.png");
  await renderPng(180, "apple-icon-180.png");
  await renderPng(192, "icon-192.png");
  await renderPng(512, "icon-512.png");

  // Maskable: identical full-bleed art (the disc already fills the frame, so it
  // survives Android's circular crop with no extra padding needed).
  await renderPng(512, "icon-512-maskable.png");

  // favicon.ico — multi-resolution 16/32/48 with embedded PNGs.
  const icoImages = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      png: await sharp(Buffer.from(markSvg(size))).png().toBuffer(),
    })),
  );
  writeFileSync(join(PUBLIC_DIR, "favicon.ico"), buildIco(icoImages));
  console.log("  ✓ favicon.ico (16/32/48 multi-res)");

  console.log("Done.");
}

void main();
