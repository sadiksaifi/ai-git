import type { InstallMethod } from "./types.ts";

// ==============================================================================
// @ai-git/content — Installation Methods
// ==============================================================================

export const INSTALL_METHODS: readonly InstallMethod[] = [
  {
    id: "npm",
    label: "npm",
    command: "npm install -g @ai-git/cli",
    note: "Also works with bun, pnpm, and yarn",
    recommended: true,
  },
  {
    id: "homebrew",
    label: "Homebrew",
    command: "brew tap sadiksaifi/tap && brew install ai-git",
    platform: "macOS",
  },
  {
    id: "shell",
    label: "Shell Script",
    command: "curl -fsSL https://ai-git.xyz/install | bash",
    platform: "macOS/Linux",
  },
  {
    id: "source",
    label: "Build from Source",
    command:
      "git clone https://github.com/sadiksaifi/ai-git.git && cd ai-git && bun install && bun run build",
  },
] as const;
