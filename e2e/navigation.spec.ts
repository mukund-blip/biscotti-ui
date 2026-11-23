import { expect, test } from "@playwright/test";

test("the homepage is the component index: headline, featured tile, category sidebar/tabs with hash sync, footer links", async ({ page }, info) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Interactive React components." })).toBeVisible();
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

  // In-app navigation home (Next pushState, no hashchange) resets the filter: header logo and footer wordmark.
  for (const home of [page.locator("header a[href='/']"), page.getByRole("contentinfo").locator("a[href='/']")]) {
    await cats.getByRole("button", { name: mobile ? /^Agents/ : /^Agent interactions/ }).click();
    await expect(page).toHaveURL(/#agent-interactions$/);
    await home.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(cats.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
    for (const id of ["tactile-controls", "commands-composition", "agent-interactions", "information-editing"]) {
      await expect(page.locator(`main section#${id}`)).toBeVisible();
    }
  }

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

test("deep links land on their section even without scroll anchoring (Safari)", async ({ page }) => {
  // Safari has no CSS scroll anchoring; switching it off in Chromium reproduces that behaviour.
  await page.addInitScript(() => {
    const css = "*{overflow-anchor:none !important}";
    addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); });
  });
  for (const path of ["/#information-editing", "/#commands-composition"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const id = path.split("#")[1];
    const heading = page.locator(`main section#${id} h2`);
    await expect(heading).toBeInViewport();
    // Lands at the index, not past it: the section heading sits near the top of the viewport.
    await expect.poll(() => heading.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBeLessThan(320);
  }
  // The breadcrumb route (a Next navigation from another page) lands the same way.
  await page.goto("/components/command-palette", { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Commands & composition" }).click();
  await expect(page).toHaveURL(/\/#commands-composition$/);
  await expect(page.locator("main section#commands-composition h2")).toBeInViewport();
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

test("footer: circular X profile link; no GitHub links while the repository is private (default build)", async ({ page }) => {
  for (const path of ["/", "/components/kinetic-button", "/foundations"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const x = page.getByRole("contentinfo").getByRole("link", { name: "Mukund Mohan on X" });
    await expect(x).toHaveAttribute("href", "https://x.com/MukundMohanK");
    const box = (await x.boundingBox())!;
    expect(Math.round(box.width)).toBe(32);
    expect(Math.round(box.height)).toBe(32);
    // rounded-full computes to a very large px radius; anything >= half the size draws a circle.
    expect(await x.evaluate((el) => parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThanOrEqual(16);
    // Private by default: no Source, Star or View source links that would 404 for visitors.
    await expect(page.locator('a[href^="https://github.com/"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Star on GitHub|View source|^Source/ })).toHaveCount(0);
  }
});

test("homepage showcase: live demos, links to component pages and group links; no version badge", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  // The header shows the brand only; the version badge is gone at every width.
  await expect(page.locator("header.sticky")).not.toContainText("0.1");

  // Both leads and every small tile link to their component pages.
  for (const [name, slug] of [
    ["Kinetic Button", "kinetic-button"], ["Precision Toggle", "precision-toggle"], ["Segmented Control", "segmented-control"],
    ["Interactive Slider", "interactive-slider"], ["Tool Execution Chip", "tool-chip"], ["Streaming Response", "streaming-response"],
    ["Workflow Stepper", "workflow-stepper"], ["Human Approval Card", "approval-card"],
  ]) {
    await expect(page.locator(`main a[href="/components/${slug}"]`).filter({ hasText: name }).first()).toBeVisible();
  }

  // The approval demo works from the keyboard: Approve, receipt, Undo.
  const lead = page.getByRole("region", { name: "Human Approval Card" });
  // Focus moves to Undo after a decision and back to Approve after Undo (never dropped to <body>).
  await lead.getByRole("button", { name: "Approve" }).focus();
  await page.keyboard.press("Enter");
  await expect(lead.getByRole("status")).toContainText("Approved");
  await expect(lead.getByRole("button", { name: "Undo" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(lead.getByRole("button", { name: "Approve" })).toBeFocused();
  // Same for Deny, using Space.
  await page.keyboard.press("Tab");
  await expect(lead.getByRole("button", { name: "Deny" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(lead.getByRole("status")).toContainText("Denied");
  await expect(lead.getByRole("button", { name: "Undo" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(lead.getByRole("button", { name: "Approve" })).toBeFocused();

  // The segmented control is live and keyboard-operable.
  const seg = page.getByRole("radiogroup", { name: "Range" });
  await seg.getByRole("radio", { name: "Week" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(seg.getByRole("radio", { name: "Month" })).toBeChecked();

  // Group links filter the index below.
  await page.getByRole("link", { name: /All tactile controls/ }).click();
  await expect(page).toHaveURL(/#tactile-controls$/);
  await expect(page.locator("main section#tactile-controls")).toBeVisible();
  await expect(page.locator("main section#agent-interactions")).toBeHidden();
  await page.getByRole("link", { name: /\+2 more/ }).click();
  await expect(page).toHaveURL(/#agent-interactions$/);
  await expect(page.locator("main section#agent-interactions")).toBeVisible();
});

test("homepage showcase: the hold-to-delete demo completes and keeps its size", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const lead = page.getByRole("region", { name: "Kinetic Button" });
  const btn = (await lead.getByRole("button", { name: /^Hold to delete/ }).elementHandle())!;
  const before = (await btn.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1300); await page.mouse.up();
  await expect.poll(() => btn.getAttribute("data-state")).toMatch(/pending|success/);
  expect(Math.round((await btn.boundingBox())!.width)).toBe(Math.round(before.width));
});
