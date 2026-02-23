import { $ } from "bun";

const OUT = "apps/web/public";

// 1. Generate SVG favicon — stylized "A" monogram with cursor
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" fill="#0a0a0a"/>
  <g fill="none" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="160,384 256,128 352,384"/>
    <line x1="192" y1="296" x2="320" y2="296"/>
    <line x1="368" y1="384" x2="416" y2="384"/>
  </g>
</svg>`;

await Bun.write(`${OUT}/favicon.svg`, svg);

// 2. Convert SVG to PNG at various sizes using rsvg-convert (proper SVG rendering)
const sizes = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "android-chrome-192x192.png", size: 192 },
  { name: "android-chrome-512x512.png", size: 512 },
];

for (const { name, size } of sizes) {
  await $`rsvg-convert -w ${size} -h ${size} ${OUT}/favicon.svg -o ${OUT}/${name}`;
}

// 3. Generate favicon.ico (multi-resolution)
await $`magick ${OUT}/favicon-16x16.png ${OUT}/favicon-32x32.png ${OUT}/favicon.ico`;

// 4. Generate OG image (1200x630) with logo + tagline
await $`magick -size 1200x630 xc:#0a0a0a \
  -font Courier-Bold -pointsize 72 -fill white \
  -gravity center -annotate +0-40 "ai-git" \
  -font Courier -pointsize 28 -fill "#a3a3a3" \
  -annotate +0+40 "AI-Powered Conventional Commits" \
  ${OUT}/og-image.png`;

console.log("Assets generated in", OUT);
