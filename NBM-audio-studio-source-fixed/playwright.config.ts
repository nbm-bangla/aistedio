import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 35_000,
  expect: { timeout: 10_000 },
  outputDir: ".artifacts/test-results",
  use: {
    baseURL: process.env.NBM_TEST_BASE_URL ?? "http://127.0.0.1:3000",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    launchOptions: { args: ["--no-sandbox"] },
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NBM_ADMIN_TOKEN: "playwright-test-admin-token",
      NBM_VAULT_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      NBM_DATA_DIR: ".artifacts/playwright-test-data",
    },
  },
});
