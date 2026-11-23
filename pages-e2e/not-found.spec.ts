import { expect, test } from "@playwright/test";

test("unknown paths return a real 404 with the Biscotti UI not-found page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // The browser logs the 404 response itself; anything else is a real error.
    if (m.type() === "error" && !/status of 404/.test(m.text())) errors.push(m.text());
  });

  const response = await page.goto("definitely-not-a-page/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Still in pencil." })).toBeVisible();
  const robots = await page.locator('meta[name="robots"]').evaluateAll((els) => els.map((e) => e.getAttribute("content")));
  expect(robots.length, "robots meta present").toBeGreaterThan(0);
  for (const content of robots) expect(content).toMatch(/noindex/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow, "404 page is wider than the viewport").toBe(0);

  const nav = page.getByRole("navigation", { name: "Where to go instead" });
  await nav.getByRole("link", { name: /Components/ }).click();
  await expect(page).toHaveURL(/\/components\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Components", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
