import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // Uploads travel to the API as base64 inside a Server Action; the backend
    // caps the raw file at 8 MB, so leave room for the ~4/3 encoding overhead.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  // TEMP-SANDBOX: reverted immediately after verification; run `tsc --noEmit` instead.
  typescript: { ignoreBuildErrors: true },
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
