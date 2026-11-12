import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Load the PDF renderer from node_modules at runtime instead of bundling it
  // (it relies on Node APIs and native-style modules that bundlers often break).
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    serverActions: {
      // Product photos can be up to 5 MB (enforced in the action); default is 1 MB.
      bodySizeLimit: "6mb",
    },
  },
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
