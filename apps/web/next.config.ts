import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/install",
        destination:
          "https://raw.githubusercontent.com/sadiksaifi/ai-git/main/install.sh",
      },
    ];
  },
};

export default nextConfig;
