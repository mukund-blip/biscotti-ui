import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@biscotti/ui";
import { catalog } from "@/catalog";
import { publicPath } from "@/site";

// Next adds <meta name="robots" content="noindex"> to not-found pages itself.
export const metadata: Metadata = { title: "Page not found" };

const routes = [
  { href: "/", label: "Components", detail: `All ${catalog.length}, live`, icon: "layers" },
  { href: "/workbench", label: "Workbench", detail: "Ten components working together", icon: "activity" },
  { href: "/foundations", label: "Foundations", detail: "Brand, colour, type, motion, sound", icon: "palette" },
] as const;

/**
 * Exported as 404.html. Static hosts (Netlify, the local preview server) serve it
 * with a real 404 status for any path that doesn't exist.
 */
export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-24 pt-14 md:px-8 md:pt-24 lg:grid-cols-[1fr_380px]">
      <div>
      <p className="flex items-center gap-2.5 font-mono text-2xs uppercase tracking-[0.08em] text-muted">
        <span className="tabular text-pencil-ink">404</span>
        <span aria-hidden className="h-px w-5 bg-rule" />
        <span>Not found</span>
      </p>
      <h1 className="mt-4 max-w-[720px] text-[clamp(34px,6vw,64px)] font-semibold leading-[1] tracking-[-0.04em]">
        Still in pencil.
      </h1>
      <p className="mt-5 max-w-[560px] text-md leading-[26px] text-ink-2">
        Nothing has been inked at this address. The page may have moved, or the link was never real. Every component lives under Components.
      </p>

      {/* The provisional rule from the components: a pencil line with a gap, never closed. */}
      <div aria-hidden className="mt-10 flex max-w-[560px] items-center gap-1.5">
        <span className="h-px w-16 bg-pencil" />
        <span className="h-px w-3" />
        <span className="h-px flex-1 bg-pencil-line" />
      </div>

      <nav aria-label="Where to go instead" className="mt-10 grid max-w-[720px] gap-3 sm:grid-cols-3">
        {routes.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="focus-ring group flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-[inset_0_0_0_1px_var(--bis-hairline)] transition-colors duration-[90ms] hover:bg-raised"
          >
            <Icon name={r.icon} size={16} className="text-muted transition-colors group-hover:text-pencil-ink" />
            <span>
              <span className="block text-base font-medium text-ink">{r.label}</span>
              <span className="mt-0.5 block text-sm text-muted">{r.detail}</span>
            </span>
          </Link>
        ))}
      </nav>
      </div>

      <figure className="m-0 hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export serves raw public assets */}
        <img
          src={publicPath("/brand/biscotti-head-960.webp")}
          srcSet={`${publicPath("/brand/biscotti-head-480.webp")} 480w, ${publicPath("/brand/biscotti-head-960.webp")} 960w`}
          sizes="380px" width={1312} height={1200} loading="lazy"
          alt="Biscotti the pup, close up, smiling with its tongue out"
          className="block h-auto w-full rounded-[14px] shadow-[inset_0_0_0_1px_var(--bis-hairline)]"
        />
        <figcaption className="mt-3 font-mono text-2xs text-muted">Biscotti looked everywhere. Nothing here yet.</figcaption>
      </figure>
    </div>
  );
}
