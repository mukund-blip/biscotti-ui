// Opt-in static build. One public URL drives paths, metadata and both registries.
import { spawnSync, execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const url = new URL(process.env.PAGES_SITE_URL ?? "https://mukund-blip.github.io/detent");
if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
  throw new Error("PAGES_SITE_URL must be an HTTP(S) origin and optional base path, without credentials, query or fragment.");
}
const basePath = url.pathname.replace(/\/$/, "");
const siteUrl = `${url.origin}${basePath}`;
const env = { ...process.env, BISCOTTI_STATIC_EXPORT: "1", NEXT_PUBLIC_BASE_PATH: basePath,
  NEXT_PUBLIC_SITE_URL: siteUrl, NEXT_PUBLIC_REGISTRY_URL: siteUrl, REGISTRY_URL: siteUrl };
function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...env, ...extraEnv }, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.execPath, ["scripts/gen-catalog.mjs"]);
run("pnpm", ["--filter", "web", "build"]);
// Generate directly into the export, leaving the checked-in local registry alone.
run(process.execPath, ["scripts/build-registry.mjs"], { REGISTRY_OUTPUT_DIR: "apps/web/out/r" });
writeFileSync(resolve(root, "apps/web/out/pages-build.json"), JSON.stringify({
  revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  siteUrl, basePath,
}, null, 2) + "\n");
console.log(`Static export: apps/web/out — mount at ${basePath || "/"}. Public URL: ${siteUrl}/ (not deployed).`);
