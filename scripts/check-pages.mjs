// Validate deployment artifacts, not Next's development server.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "../apps/web/out");
const read = (path) => readFileSync(join(root, path), "utf8");
const { siteUrl, basePath } = JSON.parse(read("pages-build.json"));
const slugs = readdirSync(resolve(import.meta.dirname, "../apps/web/src/catalog"))
  .filter((f) => f.endsWith(".tsx")).map((f) => f.slice(0, -4));
assert.ok(slugs.length > 0, "no catalog entries found");
assert.ok(existsSync(join(root, ".nojekyll")), "missing .nojekyll");
assert.ok(!existsSync(join(root, "api/stream")), "obsolete API route exported");
const routes = ["", "foundations", "workbench", ...slugs.map((s) => `components/${s}`)];
const sitemap = read("sitemap.xml");
for (const route of routes) {
  const html = read(`${route ? `${route}/` : ""}index.html`);
  assert.ok(html.includes(`href="${siteUrl}/${route ? `${route}/` : ""}"`), `missing canonical for ${route || "/"}`);
  assert.ok(sitemap.includes(`<loc>${siteUrl}/${route ? `${route}/` : ""}</loc>`), `missing sitemap route ${route}`);
  for (const [, raw] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    if (!raw.startsWith("/")) continue;
    const path = raw.split(/[?#]/)[0];
    assert.ok(!basePath || path.startsWith(`${basePath}/`), `unprefixed path ${path} in ${route}`);
    const file = path.slice(basePath.length).replace(/^\//, "");
    assert.ok(existsSync(join(root, file)), `missing asset or page ${path} in ${route}`);
  }
  if (route.startsWith("components/")) assert.ok(html.includes(`${siteUrl}/r/${route.split("/")[1]}.json`), `wrong displayed install URL in ${route}`);
}
assert.ok(read("robots.txt").includes(`${siteUrl}/sitemap.xml`));
// The homepage install command must point at this deployment's registry, never a dev server.
const home = read("index.html");
assert.ok(home.includes(`npx shadcn@latest add ${siteUrl}/r/`), "homepage install command does not use the site registry");
if (!/localhost|127\.0\.0\.1/.test(siteUrl)) assert.ok(!/localhost|127\.0\.0\.1/.test(home), "homepage mentions a local host");
// /biscotti-ui/robots.txt can't hide anything, so every exported lab harness must carry noindex itself.
// Expected lab pages come from the source routes, so a missing export fails instead of passing with nothing checked.
const labSrc = resolve(import.meta.dirname, "../apps/web/src/app/lab");
const labPages = existsSync(labSrc) ? ["", ...readdirSync(labSrc, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)]
  .filter((d) => existsSync(join(labSrc, d, "page.tsx"))).map((d) => join("lab", d, "index.html")) : [];
assert.ok(labPages.length > 0, "no lab routes found");
for (const page of labPages) {
  assert.ok(existsSync(join(root, page)), `lab page ${page} was not exported`);
  assert.match(read(page), /<meta name="robots" content="noindex, ?nofollow"/, `lab page ${page} is indexable`);
}
assert.ok(!sitemap.includes("/lab/"), "sitemap lists lab pages");
const registry = JSON.parse(read("r/registry.json"));
assert.equal(registry.homepage, siteUrl);
// Every catalog page advertises an install URL, so each needs an item, alongside the shared foundation.
const names = registry.items.map((i) => i.name);
assert.equal(new Set(names).size, names.length, "duplicate registry item names");
const missing = ["biscotti-foundation", ...slugs].filter((n) => !names.includes(n));
assert.deepEqual(missing, [], `registry is missing ${missing.join(", ")}`);
for (const { name } of registry.items) {
  const item = JSON.parse(read(`r/${name}.json`));
  for (const dependency of item.registryDependencies ?? []) {
    assert.ok(dependency.startsWith(`${siteUrl}/r/`), `wrong dependency origin ${dependency}`);
    assert.ok(existsSync(join(root, dependency.slice(`${siteUrl}/`.length))), `missing dependency ${dependency}`);
  }
  for (const file of item.files) assert.ok(file.target.startsWith("components/biscotti/"));
  // Every component (not the shared foundation) ships with a one-line origin comment on its main file.
  if (name !== "biscotti-foundation") assert.ok(item.files.some((f) => f.content.startsWith(`// ${item.title} · Biscotti UI — `)), `${name} is missing its origin comment`);
}
console.log(`Validated ${routes.length} public routes, prefixed assets/canonicals, sitemap/robots, ${labPages.length} noindex lab pages and ${registry.items.length} registry items with nested dependencies (${siteUrl}).`);
