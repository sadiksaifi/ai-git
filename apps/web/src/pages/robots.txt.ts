import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  return new Response(
    ["User-agent: *", "Allow: /", "", "Sitemap: https://ai-git.xyz/sitemap-index.xml"].join(
      "\n",
    ),
    { headers: { "Content-Type": "text/plain" } },
  );
};
