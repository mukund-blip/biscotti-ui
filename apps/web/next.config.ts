import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  ...(process.env.DETENT_STATIC_EXPORT === "1" ? {
    output: "export" as const,
    basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "/detent",
    trailingSlash: true,
    images: { unoptimized: true },
  } : {}),
  transpilePackages: ["@detent/ui"],
  turbopack: {
    root,
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
