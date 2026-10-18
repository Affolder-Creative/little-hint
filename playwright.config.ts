import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    headless: true,
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ??
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
