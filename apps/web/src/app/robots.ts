import type { MetadataRoute } from "next";
import { BASE_PATH, SITE_URL } from "@/site";

export const dynamic = "force-static";
export default function robots(): MetadataRoute.Robots {
  return SITE_URL ? {
    rules: { userAgent: "*", allow: `${BASE_PATH}/`, disallow: `${BASE_PATH}/lab/` },
    sitemap: `${SITE_URL}/sitemap.xml`,
  } : { rules: { userAgent: "*", disallow: "/" } };
}
