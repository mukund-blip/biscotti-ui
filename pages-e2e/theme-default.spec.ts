import { expect, test, type Page } from "@playwright/test";

async function expectThemeColor(page: Page, color: string) {
  await expect.poll(async () => {
    const colors = await page.locator('meta[name="theme-color"]').evaluateAll((metas) =>
      metas.map((meta) => meta.getAttribute("content")),
    );
    return colors.length > 0 && colors.every((value) => value === color);
  }).toBe(true);
}

test("first visit opens dark before hydration regardless of OS preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  const response = await page.goto("./");
  expect(response?.status()).toBe(200);
  expect(await response?.text()).toContain('<html lang="en" data-theme="dark"');
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme-pref", "dark");
  await expectThemeColor(page, "#111113");
  expect(await page.evaluate(() => localStorage.getItem("biscotti.theme"))).toBeNull();
});

test("an explicit light choice survives navigation and reload", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectThemeColor(page, "#f4f3ef");
  await page.goto("workbench/");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Light theme" })).toHaveAttribute("aria-pressed", "true");
  await expectThemeColor(page, "#f4f3ef");
  expect(await page.evaluate(() => localStorage.getItem("biscotti.theme"))).toBe("light");
});

test("an explicit system choice still follows the OS on the next visit", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  await page.getByRole("button", { name: "System theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectThemeColor(page, "#f4f3ef");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "System theme" })).toHaveAttribute("aria-pressed", "true");
  await expectThemeColor(page, "#111113");
  expect(await page.evaluate(() => localStorage.getItem("biscotti.theme"))).toBe("system");
});
