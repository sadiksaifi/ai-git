import { $ } from "bun";

const OUT = "apps/web/public";

// 1. Generate SVG favicon — geometric monogram, no text elements (avoids Freetype dependency)
// Stylized "A" mark on dark rounded-rect background
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" fill="#0a0a0a"/>
  <g fill="none" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round">
    <!-- Stylized "A" -->
    <polyline points="160,384 256,128 352,384"/>
    <line x1="192" y1="296" x2="320" y2="296"/>
    <!-- Cursor/underscore -->
    <line x1="368" y1="384" x2="416" y2="384"/>
  </g>
</svg>`;

await Bun.write(`${OUT}/favicon.svg`, svg);

// 2. Convert SVG to PNG at various sizes
const sizes = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "android-chrome-192x192.png", size: 192 },
  { name: "android-chrome-512x512.png", size: 512 },
];

for (const { name, size } of sizes) {
  await $`magick ${OUT}/favicon.svg -resize ${size}x${size} ${OUT}/${name}`;
}

// 3. Generate favicon.ico (multi-resolution)
await $`magick ${OUT}/favicon-16x16.png ${OUT}/favicon-32x32.png ${OUT}/favicon.ico`;

// 4. Generate OG image (1200x630) — geometric design without text (avoids Freetype dependency)
// Dark background with centered logo mark
await $`magick -size 1200x630 xc:#0a0a0a ${OUT}/og-image.png`;
// Composite the logo onto the OG image, centered
await $`magick ${OUT}/og-image.png \( ${OUT}/android-chrome-512x512.png -resize 200x200 \) -gravity center -composite ${OUT}/og-image.png`;

console.log("Assets generated in", OUT);
