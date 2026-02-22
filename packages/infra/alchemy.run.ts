import alchemy from "alchemy";
import { Astro } from "alchemy/cloudflare";

const app = await alchemy("ai-git");

export const web = await Astro("web", {
  cwd: "../../apps/web",
});

console.log(`Web -> ${web.url}`);

await app.finalize();
