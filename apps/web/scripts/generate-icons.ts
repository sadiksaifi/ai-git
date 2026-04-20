// Generates icon variants from the single source-of-truth logo.svg.
// Re-run whenever logo.svg, og.svg, or twitter.svg change.
//
// Outputs (all programmatic):
//   - favicon.svg           logo.svg wrapped in a #FF9574 rounded tile with white chevrons
//   - apple-touch-icon.png  180x180 raster of favicon.svg
//   - og.png                1200x630 raster of og.svg
//   - twitter.png           1200x628 raster of twitter.svg
//
// Usage: bun scripts/generate-icons.ts

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const pub = (name: string) => resolve(here, "..", "public", name);

const ICON_FG = "#ffffff";
const TILE_START = "#ff9574"; // brand at top-left
const TILE_END = "#8f3e22"; // medium warm rust at bottom-right
const DEFAULT_LOGO_VIEWBOX = "0 0 64 64";

const logo = await readFile(pub("logo.svg"), "utf8");
const logoViewBox = logo.match(/<svg\b[^>]*\bviewBox=(["'])(.*?)\1/i)?.[2] ?? DEFAULT_LOGO_VIEWBOX;

if (logoViewBox !== DEFAULT_LOGO_VIEWBOX) {
  throw new Error(
    `logo.svg must use viewBox="${DEFAULT_LOGO_VIEWBOX}" before generating icons; got "${logoViewBox}"`,
  );
}

const logoInner = logo
  .replace(/<\?xml[^>]*\?>/, "")
  .replace(/<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace(/\s(?:fill|stroke|color)=(["']).*?\1/gi, "")
  .trim();

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logoViewBox}" width="64" height="64">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${TILE_START}"/>
      <stop offset="100%" stop-color="${TILE_END}"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#tile)"/>
  <g fill="none" stroke="${ICON_FG}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    ${logoInner}
  </g>
</svg>
`;

await writeFile(pub("favicon.svg"), faviconSvg);

await sharp(Buffer.from(faviconSvg), { density: 400 })
  .resize(180, 180)
  .png()
  .toFile(pub("apple-touch-icon.png"));

const ogSvg = await readFile(pub("og.svg"));
const twitterSvg = await readFile(pub("twitter.svg"));
await sharp(ogSvg, { density: 150 }).resize(1200, 630).png().toFile(pub("og.png"));
await sharp(twitterSvg, { density: 150 }).resize(1200, 628).png().toFile(pub("twitter.png"));

console.log("✓ Generated favicon.svg + apple-touch-icon.png + og.png + twitter.png");
