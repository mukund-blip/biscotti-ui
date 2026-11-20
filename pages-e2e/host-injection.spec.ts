import { expect, test, type Page } from "@playwright/test";

/**
 * Static hosts rewrite HTML on the way out. Netlify, for one, inserts
 * "\n<!-- This site is hosted on Netlify … -->" straight after <meta charset>.
 * The newline is a text node inside <head>, which React refuses to hydrate (#418);
 * the client re-render that follows then resets <html data-theme> and loses the
 * visitor's saved theme. These tests serve the export with such injections.
 */
const injections = {
  "netlify comment": (html: string) =>
    html.replace(
      '<meta charSet="utf-8"/>',
      '<meta charSet="utf-8"/>\n<!-- This site is hosted on Netlify. Anyone can build and deploy a site\n     like this one for free. -->',
    ),
  "whitespace at both ends of <head>": (html: string) =>
    html.replace("<head>", "<head>\n  ").replace("</head>", "\n</head>"),
};

async function serveWith(page: Page, inject: (html: string) => string) {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    const html = await response.text();
    const injected = inject(html);
    expect(injected, "injection did not apply").not.toBe(html);
    await route.fulfill({ response, body: injected });
  });
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return errors;
}

for (const [name, inject] of Object.entries(injections)) {
  test(`hydrates cleanly with host-injected HTML (${name})`, async ({ page }) => {
    await serveWith(page, inject);
    const errors = collectErrors(page);
    for (const route of ["./", "components/", "components/tool-chip/", "foundations/"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      // Let React finish hydrating and any recoverable-error fallback run.
      await page.waitForLoadState("networkidle");
    }
    expect(errors.filter((e) => /418|hydrat/i.test(e)), "hydration errors").toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`saved dark theme survives reload with host-injected HTML (${name})`, async ({ page }) => {
    await serveWith(page, inject);
    const errors = collectErrors(page);
    await page.goto("foundations/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
    // A fresh page in the same session must also open dark.
    await page.goto("components/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(errors).toEqual([]);
  });
}
