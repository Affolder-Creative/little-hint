import { defineConfig } from "@playwright/test";
import path from "node:path";
import base from "./playwright.config";

const artifacts =
  process.env.ACCEPTANCE_ARTIFACT_DIR ?? "test-results/acceptance";
export default defineConfig({
  ...base,
  testMatch: [
    "account-closure.spec.ts",
    "account-email.spec.ts",
    "account-export.spec.ts",
    "settings-polish.spec.ts",
    "ui-refinements.spec.ts",
  ],
  // These suites use synthetic API fixtures, never a remote app or database.
  use: {
    baseURL: process.env.E2E_BASE_URL,
    headless: true,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  outputDir: path.join(artifacts, "artifacts"),
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(artifacts, "results.json") }],
    ["html", { open: "never", outputFolder: path.join(artifacts, "html") }],
  ],
});
