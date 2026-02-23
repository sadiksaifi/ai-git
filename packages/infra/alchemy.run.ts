import alchemy from "alchemy";
import { CustomDomain, Vite } from "alchemy/cloudflare";

const isDev = !!process.env.ALCHEMY_DEV;

const app = await alchemy("ai-git", {
  profile: "default",
  stage: isDev ? "development" : "production",
});

export const web = await Vite("web", {
  cwd: "../../apps/web",
  assets: "dist",
});

if (!isDev) {
  await CustomDomain("web-domain", {
    name: "ai-git.xyz",
    workerName: web.name,
  });
}

console.log(`Web -> ${web.url}`);

await app.finalize();
