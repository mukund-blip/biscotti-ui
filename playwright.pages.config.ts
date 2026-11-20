import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";

const { basePath } = JSON.parse(readFileSync("apps/web/out/pages-build.json", "utf8"));
const port = Number(process.env.PORT ?? 3418);
export default defineConfig({
  testDir: "pages-e2e",
  timeout: 60_000,
  workers: 4,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}${basePath}/`, trace: "retain-on-failure" },
  webServer: { command: "pnpm preview:pages", url: `http://127.0.0.1:${port}${basePath}/pages-build.json`, reuseExistingServer: !process.env.CI },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
