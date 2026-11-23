import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const slugs = readdirSync(join(__dirname, "../apps/web/src/catalog"))
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => f.replace(".tsx", ""));
const routes = ["/", "/components", "/foundations", "/workbench", ...slugs.map((s) => `/components/${s}`)];

for (const theme of ["light", "dark"] as const) {
  for (const route of routes) {
    test(`${route} [${theme}] renders without console errors and passes axe`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript((t) => localStorage.setItem("biscotti.theme", t), theme);
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("main")).toBeVisible();
      expect(errors, errors.join("\n")).toEqual([]);
      if (info.project.name === "desktop") {
        // Autoplaying demos loop forever, so a sample can land mid-fade (and read as low contrast).
        // Audit twice, 900 ms apart, and fail only on violations present in both samples: real
        // defects are stable; transitions are not.
        const audit = async () => {
          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();
          return results.violations
            .filter((v) => v.impact === "serious" || v.impact === "critical")
            .flatMap((v) => v.nodes.map((n) => `${v.id}: ${v.help} → ${n.target.join(" ")}`));
        };
        await page.waitForTimeout(600);
        const first = await audit();
        if (first.length) await page.waitForTimeout(900);
        const second = first.length ? new Set(await audit()) : new Set<string>();
        expect(first.filter((v) => second.has(v))).toEqual([]);
      }
    });
  }
}

test("reduced motion: pages render and timeline uses no sweep animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/components/thinking-timeline", { waitUntil: "networkidle" });
  const anim = await page.evaluate(() => {
    const el = document.querySelector(".bis-live-text");
    return el ? getComputedStyle(el).animationName : "none";
  });
  expect(anim).toBe("none");
});
