// Validate deployment artifacts, not Next's development server.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "../apps/web/out");
const read = (path) => readFileSync(join(root, path), "utf8");
const { siteUrl, basePath } = JSON.parse(read("pages-build.json"));
const slugs = readdirSync(resolve(import.meta.dirname, "../apps/web/src/catalog"))
  .filter((f) => f.endsWith(".tsx")).map((f) => f.slice(0, -4));
assert.equal(slugs.length, 20);
assert.ok(existsSync(join(root, ".nojekyll")), "missing .nojekyll");
assert.ok(!existsSync(join(root, "api/stream")), "obsolete API route exported");
const routes = ["", "components", "foundations", "workbench", ...slugs.map((s) => `components/${s}`)];
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
// /detent/robots.txt can't hide anything, so every exported lab harness must carry noindex itself.
const labDir = join(root, "lab");
const labPages = existsSync(labDir) ? ["", ...readdirSync(labDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)]
  .map((d) => join("lab", d, "index.html")).filter((f) => existsSync(join(root, f))) : [];
for (const page of labPages) {
  assert.match(read(page), /<meta name="robots" content="noindex, ?nofollow"/, `lab page ${page} is indexable`);
  assert.ok(!sitemap.includes("/lab/"), "sitemap lists lab pages");
}
const registry = JSON.parse(read("r/registry.json"));
assert.equal(registry.homepage, siteUrl);
assert.equal(registry.items.length, 21);
for (const { name } of registry.items) {
  const item = JSON.parse(read(`r/${name}.json`));
  for (const dependency of item.registryDependencies ?? []) {
    assert.ok(dependency.startsWith(`${siteUrl}/r/`), `wrong dependency origin ${dependency}`);
    assert.ok(existsSync(join(root, dependency.slice(`${siteUrl}/`.length))), `missing dependency ${dependency}`);
  }
  for (const file of item.files) assert.ok(file.target.startsWith("components/detent/"));
}
console.log(`Validated ${routes.length} public routes, prefixed assets/canonicals, sitemap/robots and 21 registry items with nested dependencies (${siteUrl}).`);
