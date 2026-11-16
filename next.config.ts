import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted in Docker (Synology / VPS): ship a minimal standalone server.
  output: "standalone",
  // Native / heavy server-only packages must not be bundled.
  serverExternalPackages: [
    "better-sqlite3",
    "@node-rs/argon2",
    "playwright-core",
    "nodemailer",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
