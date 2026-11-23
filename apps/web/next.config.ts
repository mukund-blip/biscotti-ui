import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const staticExport = process.env.BISCOTTI_STATIC_EXPORT === "1";
// The single basePath rule: only static exports get one (scripts/build-pages.mjs sets it from PAGES_SITE_URL).
// It is republished below so site.ts's publicPath/robots always use exactly the value Next routes with.
const basePath = staticExport ? (process.env.NEXT_PUBLIC_BASE_PATH ?? "") : "";

const nextConfig: NextConfig = {
  ...(staticExport ? {
    output: "export" as const,
    basePath,
    trailingSlash: true,
    images: { unoptimized: true },
  } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  transpilePackages: ["@biscotti/ui"],
  turbopack: {
    root,
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
