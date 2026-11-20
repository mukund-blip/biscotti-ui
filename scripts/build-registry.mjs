// Builds a shadcn-compatible registry into apps/web/public/r/.
// Every file keeps its path under components/detent/, so relative imports survive.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "packages/ui/src");
const OUT = resolve(ROOT, process.env.REGISTRY_OUTPUT_DIR ?? "apps/web/public/r");
const BASE = (process.env.REGISTRY_URL ?? process.env.NEXT_PUBLIC_REGISTRY_URL ?? "http://localhost:3410").replace(/\/$/, "");
// Keep in sync with apps/web/src/site.ts.
const REPO = (process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/mukund-blip/detent").replace(/\/$/, "");
const BRANCH = process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main";
/** One quiet line at the top of each copied component, pointing back to its source. No licence terms implied. */
const origin = (slug, title) => `// ${title} · Detent — ${REPO.replace(/^https?:\/\//, "")}/tree/${BRANCH}/packages/ui/src/components/${slug}\n`;
mkdirSync(OUT, { recursive: true });

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const NPM = ["motion", "@base-ui/react"];
const fileType = (p) => (p.endsWith(".css") ? "registry:style" : p.includes("/components/") ? "registry:component" : "registry:lib");
const toFile = (abs) => {
  const rel = relative(SRC, abs);
  return { path: `detent/${rel}`, type: fileType(abs), target: `components/detent/${rel}`, content: readFileSync(abs, "utf8") };
};
const depsOf = (files) => [...new Set(files.flatMap((f) => NPM.filter((n) => f.content.includes(`from "${n}`))))];

// Foundation
const foundationFiles = ["styles", "motion", "sound", "lib", "icons"].flatMap((d) => walk(join(SRC, d))).filter((f) => !/\.test\./.test(f)).map(toFile);
const foundation = {
  $schema: "https://ui.shadcn.com/schema/registry-item.json",
  name: "detent-foundation",
  type: "registry:lib",
  title: "Detent foundation",
  description: "Tokens (CSS variables + Tailwind v4 theme), motion springs, the synthesised sound engine, utilities, primitives and icons.",
  dependencies: depsOf(foundationFiles),
  files: foundationFiles,
};
writeFileSync(join(OUT, "detent-foundation.json"), JSON.stringify(foundation, null, 2));

// Catalog metadata (names/descriptions) from catalog sources, best-effort.
const catDir = join(ROOT, "apps/web/src/catalog");
const meta = (slug) => {
  const p = join(catDir, `${slug}.tsx`);
  if (!existsSync(p)) return {};
  const s = readFileSync(p, "utf8");
  const pick = (k) => s.match(new RegExp(`${k}:\\s*"([^"]+)"`))?.[1];
  return { title: pick("name"), description: pick("summary") };
};

const items = [{ name: foundation.name, type: foundation.type, title: foundation.title, description: foundation.description }];
for (const slug of readdirSync(join(SRC, "components"))) {
  const dir = join(SRC, "components", slug);
  const files = walk(dir).filter((f) => !/\.test\.|\.stories\./.test(f)).map(toFile);
  if (!files.some((f) => f.content.length > 40 && !/^export \{\};\s*$/.test(f.content))) continue; // empty slot
  const crossDeps = [...new Set(files.flatMap((f) => [...f.content.matchAll(/from "\.\.\/([a-z-]+)(?:\/[^"]*)?"/g)].map((m) => m[1])))].filter((d) => d !== slug && existsSync(join(SRC, "components", d)));
  const m = meta(slug);
  const main = files.find((f) => f.path === `detent/components/${slug}/${slug}.tsx`);
  if (main) main.content = origin(slug, m.title ?? slug) + main.content;
  const item = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: slug,
    type: "registry:ui",
    title: m.title ?? slug,
    description: m.description ?? "",
    dependencies: depsOf(files),
    registryDependencies: [`${BASE}/r/detent-foundation.json`, ...crossDeps.map((d) => `${BASE}/r/${d}.json`)],
    files,
  };
  writeFileSync(join(OUT, `${slug}.json`), JSON.stringify(item, null, 2));
  items.push({ name: slug, type: item.type, title: item.title, description: item.description });
}
writeFileSync(
  join(OUT, "registry.json"),
  JSON.stringify({ $schema: "https://ui.shadcn.com/schema/registry.json", name: "detent", homepage: BASE, items }, null, 2),
);
console.log(`registry: ${items.length} items → ${relative(ROOT, OUT)} (base ${BASE})`);
