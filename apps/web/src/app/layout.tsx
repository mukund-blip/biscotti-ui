import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { SiteChrome } from "@/components/site-chrome";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const serif = Newsreader({ subsets: ["latin"], style: ["italic"], weight: ["400"], variable: "--font-newsreader" });

export const metadata: Metadata = {
  title: { default: "Detent — interactive components for precise software", template: "%s · Detent" },
  description: "Twenty components for productivity, creative and AI-native tools. Quiet at rest. Delightful in motion. Precise in use.",
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
