// Generates rasterized icon variants + OG image from SVG sources in apps/web/public/.
// Re-run whenever favicon.svg or og.svg changes.
//
// Usage: bun scripts/generate-icons.ts

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const pub = (name: string) => resolve(here, "..", "public", name);

const favSvg = await readFile(pub("favicon.svg"));
const ogSvg = await readFile(pub("og.svg"));
const twitterSvg = await readFile(pub("twitter.svg"));

await sharp(favSvg, { density: 400 }).resize(180, 180).png().toFile(pub("apple-touch-icon.png"));
await sharp(ogSvg, { density: 150 }).resize(1200, 630).png().toFile(pub("og.png"));
await sharp(twitterSvg, { density: 150 }).resize(1200, 628).png().toFile(pub("twitter.png"));

console.log("✓ Generated apple-touch-icon.png + og.png + twitter.png");
