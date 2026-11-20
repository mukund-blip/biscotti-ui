/**
 * Site-wide links. Everything that depends on where Detent is hosted lives here,
 * so a deployment only has to set environment variables — nothing is hard-coded
 * to a public domain.
 */

/** Source repository. Override with NEXT_PUBLIC_REPO_URL for forks. */
export const REPO_URL = (process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/mukund-blip/detent").replace(/\/$/, "");

/** Branch used for "view source" links. */
export const REPO_BRANCH = process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main";

const LOCAL_REGISTRY = "http://localhost:3410";

/** Where `apps/web/public/r` is served. Defaults to the local dev server. */
export const REGISTRY_URL = (process.env.NEXT_PUBLIC_REGISTRY_URL ?? LOCAL_REGISTRY).replace(/\/$/, "");

/** True when no hosted registry has been configured, so install commands only work against `pnpm dev`. */
export const REGISTRY_IS_LOCAL = REGISTRY_URL === LOCAL_REGISTRY;

export const componentSourceUrl = (slug: string) => `${REPO_URL}/tree/${REPO_BRANCH}/packages/ui/src/components/${slug}`;

/** One quiet line that travels with copied examples, pointing back to where they came from. */
export const originComment = (slug: string, name: string) => `// ${name} · Detent — ${componentSourceUrl(slug).replace(/^https?:\/\//, "")}`;
