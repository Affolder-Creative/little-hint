import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: process.env.CI ? 180000 : 45000,
  expect: { timeout: process.env.CI ? 15000 : 5000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
    },
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
