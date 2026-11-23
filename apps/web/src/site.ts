/**
 * Site-wide links. Everything that depends on where Biscotti UI is hosted lives here,
 * so a deployment only has to set environment variables — nothing is hard-coded
 * to a public domain.
 */

/** Source repository. Override with NEXT_PUBLIC_REPO_URL for forks. */
export const REPO_URL = (process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/mukund-blip/biscotti-ui").replace(/\/$/, "");

/**
 * The repository is private until launch. Links to it (header and footer Source, Star on GitHub, and
 * "View source" on component pages) render only when the build sets NEXT_PUBLIC_REPO_PUBLIC=true.
 */
export const REPO_PUBLIC = process.env.NEXT_PUBLIC_REPO_PUBLIC === "true";

/** Author profile on X, linked from the footer. */
export const X_PROFILE_URL = "https://x.com/MukundMohanK";

/** Branch used for "view source" links. */
export const REPO_BRANCH = process.env.NEXT_PUBLIC_REPO_BRANCH ?? "main";

const LOCAL_REGISTRY = "http://localhost:3410";

/** Where `apps/web/public/r` is served. Defaults to the local dev server. */
export const REGISTRY_URL = (process.env.NEXT_PUBLIC_REGISTRY_URL ?? LOCAL_REGISTRY).replace(/\/$/, "");

/** True when no hosted registry has been configured, so install commands only work against `pnpm dev`. */
export const REGISTRY_IS_LOCAL = REGISTRY_URL === LOCAL_REGISTRY;

export const componentSourceUrl = (slug: string) => `${REPO_URL}/tree/${REPO_BRANCH}/packages/ui/src/components/${slug}`;

/** One quiet line that travels with copied examples, pointing back to where they came from. */
export const originComment = (slug: string, name: string) => `// ${name} · Biscotti UI — ${componentSourceUrl(slug).replace(/^https?:\/\//, "")}`;


/**
 * Build-time path for raw public assets; Next Link prefixes page links itself.
 * next.config.ts republishes the basePath it routes with, so this is never out of step with Next.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const publicPath = (path: string) => `${BASE_PATH}/${path.replace(/^\//, "")}`;

/** Set for hosted builds; normal development does not advertise a public canonical. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
export const siteUrl = (path = "") => {
  const route = path.replace(/^\/+|\/+$/g, "");
  return SITE_URL ? `${SITE_URL}/${route ? `${route}/` : ""}` : undefined;
};
export const canonicalMetadata = (path = "") => SITE_URL ? { alternates: { canonical: siteUrl(path) } } : {};
