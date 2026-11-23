import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";

const slugs = readdirSync("apps/web/src/catalog").filter((f) => f.endsWith(".tsx")).map((f) => f.slice(0, -4));
for (const theme of ["light", "dark"] as const) {
  for (const route of ["", "components/", "foundations/", "workbench/", ...slugs.map((s) => `components/${s}/`)]) {
    test(`${route || "/"} direct navigation + reload [${theme}]`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await page.addInitScript((t) => localStorage.setItem("biscotti.theme", t), theme);
      const response = await page.goto(route || "./");
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toBeVisible();
      expect((await page.reload())?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      // On failure, name the elements that stick out so CI logs point at the cause.
      const overflow = await page.evaluate(() => {
        if (document.documentElement.scrollWidth <= innerWidth) return [];
        return [...document.querySelectorAll("body *")]
          .map((el) => ({ el, right: el.getBoundingClientRect().right }))
          .filter(({ right }) => right > innerWidth + 0.5)
          .sort((a, b) => b.right - a.right).slice(0, 8)
          .map(({ el, right }) => `${Math.round(right)}px ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} "${(el.textContent ?? "").trim().slice(0, 40)}"`);
      });
      expect(overflow, `page is wider than ${page.viewportSize()?.width}px`).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("static stream: cancel keeps partial text; failure retries and completes", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/")) apiRequests.push(r.url()); });
  await page.goto("components/streaming-response/");
  const response = page.getByRole("article", { name: "Response", exact: true });
  const panel = page.locator("[data-status]").filter({ has: response });
  await response.scrollIntoViewIfNeeded();
  await expect(response).toHaveAttribute("aria-busy", "true");
  await expect(response).toContainText("Short answer", { timeout: 10_000 });
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(panel).toHaveAttribute("data-status", "stopped");
  const partial = await response.innerText();
  await page.waitForTimeout(400);
  expect(await response.innerText()).toBe(partial);
  await page.getByLabel("Simulate failure midway", { exact: true }).check();
  await page.getByRole("radio", { name: "2×", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Retry", exact: true })).toBeVisible({ timeout: 35_000 });
  await expect(panel).toContainText("Partial answer kept");
  await panel.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(response).toHaveAttribute("aria-busy", "true");
  await page.getByLabel("Simulate failure midway", { exact: true }).uncheck();
  await expect(panel.getByRole("button", { name: "Regenerate", exact: true })).toBeVisible({ timeout: 40_000 });
  await expect(response).toContainText("tell retailers by Friday");
  expect(apiRequests).toEqual([]);
});

test("workbench: stop tools then restart and finish browser stream", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/")) apiRequests.push(r.url()); });
  await page.goto("workbench/");
  await expect(page.getByText("Demo: Scout’s answer and tool results are simulated in your browser.")).toBeVisible();
  const prompt = page.getByRole("combobox", { name: "Message Scout" });
  await prompt.scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Send prompt", exact: true }).click();
  await page.getByRole("button", { name: "Stop generating", exact: true }).click();
  await prompt.fill("Which supplier should we order from?");
  await page.getByRole("button", { name: "Send prompt", exact: true }).click();
  const answer = page.getByRole("article", { name: "Scout’s answer", exact: true });
  await expect(answer).toContainText("Short answer", { timeout: 15_000 });
  await expect(page.locator("[data-status]").filter({ has: answer }).getByRole("button", { name: "Regenerate", exact: true })).toBeVisible({ timeout: 45_000 });
  // Pending approval is labelled by its action; the "Digi-Key PO · …" summary only appears on the post-decision receipt.
  const approval = page.getByRole("region", { name: "Place a Digi-Key order for 1,200 PEC11R encoders.", exact: true });
  await expect(approval).toBeVisible();
  await expect(approval).toContainText("$2,208.00");
  expect(apiRequests).toEqual([]);
});
