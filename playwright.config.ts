import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3410);
export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  fullyParallel: true,
  workers: 4,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  // Reuse a running dev/prod server; otherwise start the production build.
  webServer: { command: `pnpm --filter web start --port ${PORT}`, port: PORT, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
