import { defineConfig, devices } from "@playwright/test";
import { loadRootEnv } from "./env.cjs";

loadRootEnv();
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL database ending in _test.");
}
export default defineConfig({
  testDir: "./tests/e2e", timeout: 90_000, workers: 1,
  reporter: "list", use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", actionTimeout: 15_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1050 } } }],
  webServer: [
    { command: "pnpm exec tsx tests/e2e/provider.ts", url: "http://127.0.0.1:4321", reuseExistingServer: false },
    { command: "pnpm db:migrate && pnpm build && pnpm exec next start --port 3100", url: "http://localhost:3100", reuseExistingServer: false, timeout: 120_000,
      env: { DATABASE_URL: databaseUrl, OPENAI_API_KEY: "local-test-key", OPENAI_BASE_URL: "http://127.0.0.1:4321/v1", APP_URL: "http://localhost:3100", COOKIE_SECURE: "false" } },
  ],
});
