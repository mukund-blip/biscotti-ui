import type { MetadataRoute } from "next";
import { catalog } from "@/catalog";
import { SITE_URL, siteUrl } from "@/site";

export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE_URL) return [];
  return ["", "foundations", "workbench", ...catalog.map((e) => `components/${e.slug}`)]
    .map((path) => ({ url: siteUrl(path)! }));
}
