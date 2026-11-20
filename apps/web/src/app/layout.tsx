import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { SiteChrome } from "@/components/site-chrome";
import { ThemeScript } from "@/components/theme-script";
import { SITE_URL } from "@/site";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const serif = Newsreader({ subsets: ["latin"], style: ["italic"], weight: ["400"], variable: "--font-newsreader" });

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(`${SITE_URL}/`) : undefined,
  title: { default: "Detent: interactive React components", template: "%s · Detent" },
  description: "Twenty interactive React components. Try controls, editors and agent workflows, then copy the source into your app.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <head>
        <style>{`:root{--dt-font-sans:var(--font-geist),ui-sans-serif,system-ui,sans-serif;--dt-font-mono:var(--font-geist-mono),ui-monospace,monospace;--dt-font-serif:var(--font-newsreader),Georgia,serif}`}</style>
      </head>
      <body>
        <ThemeScript />
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
