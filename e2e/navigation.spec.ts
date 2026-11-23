import { expect, test } from "@playwright/test";

test("the homepage is the component index: headline, featured tile, category sidebar/tabs with hash sync, footer links", async ({ page }, info) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Twenty components, built to be touched." })).toBeVisible();
  // The header carries the brand, sound and theme only.
  await expect(page.locator("header nav")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Copy to clipboard/ }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Kinetic Button" })).toBeVisible();

  // Desktop shows the sidebar; phones (<= 768 px) show the compact tab row instead.
  const mobile = (page.viewportSize()?.width ?? 1280) <= 768;
  const cats = page.getByRole("navigation", { name: mobile ? "Categories (compact)" : "Categories", exact: true });
  await expect(cats).toBeVisible();
  await expect(cats.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("main section#tactile-controls")).toBeVisible();

  await cats.getByRole("button", { name: mobile ? /^Agents/ : /^Agent interactions/ }).click();
  await expect(page).toHaveURL(/#agent-interactions$/);
  await expect(page.locator("main section#agent-interactions")).toBeVisible();
  await expect(page.locator("main section#tactile-controls")).toBeHidden();

  // A linked category opens filtered.
  await page.goto("/#information-editing", { waitUntil: "networkidle" });
  await expect(cats.getByRole("button", { name: mobile ? /^Editing/ : /^Information & editing/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("main section#commands-composition")).toBeHidden();

  const footer = page.getByRole("navigation", { name: "Site" });
  await footer.getByRole("link", { name: "Foundations" }).click();
  await expect(page.getByRole("img", { name: /Biscotti, the Biscotti UI mascot/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Workbench" }).click();
  await expect(page).toHaveURL(/\/workbench\/?$/);
  void info;
});

for (const width of [320, 390]) {
  test(`phone category tabs never clip a label at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/", { waitUntil: "networkidle" });
    const tabs = page.getByRole("navigation", { name: "Categories (compact)" }).getByRole("button");
    await expect(tabs).toHaveCount(5);
    for (const tab of await tabs.all()) {
      const fits = await tab.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1;
      });
      expect(fits, `${await tab.textContent()} is clipped`).toBe(true);
    }
  });
}

test("component pages lead back to the index and, where relevant, to the Workbench", async ({ page }) => {
  await page.goto("/components/command-palette", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: /in the Workbench/ })).toBeVisible();
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Commands & composition" }).click();
  await expect(page).toHaveURL(/\/#commands-composition$/);
  await expect(page.locator("main section#commands-composition h2")).toBeInViewport();
  await page.goto("/components/segmented-control", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: /in the Workbench/ })).toHaveCount(0);
});

test("a hold-to-confirm Kinetic Button keeps its size when it completes", async ({ page }) => {
  await page.goto("/components/kinetic-button", { waitUntil: "networkidle" });
  const loc = page.getByRole("button", { name: /^Hold to delete/ }).first();
  await loc.scrollIntoViewIfNeeded();
  // Its accessible name changes as it runs, so follow this exact element.
  const btn = (await loc.elementHandle())!;
  const before = (await btn.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1500); await page.mouse.up();
  await expect.poll(() => btn.getAttribute("data-state")).toMatch(/pending|success/);
  for (const state of ["pending", "success"]) {
    await expect.poll(() => btn.getAttribute("data-state"), { timeout: 4000 }).toMatch(new RegExp(state === "pending" ? "pending|success" : "success"));
    const now = (await btn.boundingBox())!;
    expect(Math.round(now.width), `width while ${state}`).toBe(Math.round(before.width));
    expect(Math.round(now.x), `x while ${state}`).toBe(Math.round(before.x));
  }
});
