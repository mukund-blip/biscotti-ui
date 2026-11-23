import type { Metadata } from "next";
import { Fredoka, Geist, Geist_Mono, Newsreader } from "next/font/google";
import { SiteChrome } from "@/components/site-chrome";
import { ThemeScript } from "@/components/theme-script";
import { SITE_URL } from "@/site";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
// Fredoka is the Biscotti UI wordmark face; it is used for the brand name only.
const brand = Fredoka({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-fredoka" });
const serif = Newsreader({ subsets: ["latin"], style: ["italic"], weight: ["400"], variable: "--font-newsreader" });

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(`${SITE_URL}/`) : undefined,
  title: { default: "Biscotti UI — interactive components for precise software", template: "%s · Biscotti UI" },
  description: "Twenty components for productivity, creative and AI-native tools. Quiet at rest. Delightful in motion. Precise in use.",
  applicationName: "Biscotti UI",
  openGraph: { siteName: "Biscotti UI", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${serif.variable} ${brand.variable}`}>
      <head>
        <style>{`:root{--bis-font-sans:var(--font-geist),ui-sans-serif,system-ui,sans-serif;--bis-font-mono:var(--font-geist-mono),ui-monospace,monospace;--bis-font-serif:var(--font-newsreader),Georgia,serif}`}</style>
      </head>
      <body>
        <ThemeScript />
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
