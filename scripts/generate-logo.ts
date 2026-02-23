import { $ } from "bun";

const OUT = "apps/web/public";

// 1. Generate SVG favicon — split prism mark (two triangles diverging from a single point)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0a0a0a"/>
  <path d="M 252 96 L 128 400 L 230 400 L 252 308 Z" fill="white"/>
  <path d="M 260 96 L 384 400 L 282 400 L 260 308 Z" fill="white"/>
</svg>`;

await Bun.write(`${OUT}/favicon.svg`, svg);

// 2. Convert SVG to PNG at various sizes using rsvg-convert
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

// 4. Generate OG image (1200x630) — logo centered with tagline
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <g transform="translate(520, 120) scale(0.6)">
    <path d="M 252 96 L 128 400 L 230 400 L 252 308 Z" fill="white"/>
    <path d="M 260 96 L 384 400 L 282 400 L 260 308 Z" fill="white"/>
  </g>
</svg>`;

await Bun.write("/tmp/og-template.svg", ogSvg);
await $`rsvg-convert -w 1200 -h 630 /tmp/og-template.svg -o /tmp/og-base.png`;

// Add text with ImageMagick
await $`magick /tmp/og-base.png \
  -font Courier-Bold -pointsize 72 -fill white \
  -gravity south -annotate +0+140 "ai-git" \
  -font Courier -pointsize 28 -fill "#a3a3a3" \
  -annotate +0+100 "AI-Powered Conventional Commits" \
  ${OUT}/og-image.png`;

console.log("Assets generated in", OUT);
