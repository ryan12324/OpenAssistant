import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-better-sqlite3", "better-sqlite3", "@kreuzberg/node", "@modelcontextprotocol/sdk"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
