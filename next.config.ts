import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mastra and pg are server-only Node packages; don't bundle them.
  serverExternalPackages: ["@mastra/core", "@mastra/memory", "@mastra/pg", "pg"],
};

export default nextConfig;
