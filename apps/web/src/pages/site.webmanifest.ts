import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  return new Response(
    JSON.stringify({
      name: "AI Git",
      short_name: "AI Git",
      icons: [
        { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
      ],
      theme_color: "#0a0a0a",
      background_color: "#0a0a0a",
      display: "standalone",
    }),
    { headers: { "Content-Type": "application/manifest+json" } },
  );
};
