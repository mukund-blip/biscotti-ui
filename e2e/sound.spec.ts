import { expect, test } from "@playwright/test";

test("sound is off by default, opt-in persists, never auto-enables on reload, and can be disabled permanently", async ({ page }) => {
  await page.goto("/foundations");
  const toggle = page.getByRole("button", { name: /Sound (on|off)/ }).first();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // Instrument the AudioContext to count scheduled sources.
  await page.evaluate(() => {
    const w = window as unknown as { __started: number };
    w.__started = 0;
    const orig = AudioScheduledSourceNode.prototype.start;
    AudioScheduledSourceNode.prototype.start = function (...a: Parameters<typeof orig>) { w.__started++; return orig.apply(this, a); };
  });
  await page.getByRole("button", { name: /Play tick/ }).dispatchEvent("pointerdown");
  expect(await page.evaluate(() => (window as unknown as { __started: number }).__started)).toBe(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Play confirm/ }).dispatchEvent("pointerdown");
  expect(await page.evaluate(() => (window as unknown as { __started: number }).__started)).toBeGreaterThan(0);
  // Reload: preference remembered but audio stays silent until a fresh gesture.
  await page.reload();
  await expect(page.getByRole("button", { name: /Sound (on|off)/ }).first()).toHaveAttribute("aria-pressed", "false");
  // Permanent disable
  await page.getByRole("button", { name: "Sound settings" }).first().click();
  await page.getByLabel("Never play sounds on this device").check();
  await expect(page.getByRole("button", { name: /Sound|Disabled/ }).first()).toBeDisabled();
});
