import type { Metadata } from "next";
import { SITE_URL } from "@/site";

/**
 * Lab pages are bare test harnesses, not public showcase routes. Hosted builds mark them noindex:
 * a project site's `/detent/robots.txt` is never read by crawlers, so it cannot hide them.
 */
export const metadata: Metadata = SITE_URL ? { robots: { index: false, follow: false } } : {};

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
