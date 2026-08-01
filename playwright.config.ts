import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against the production build rather than the dev server: several of the bugs these
 * tests cover were CSS-specificity and asset-path problems, and the dev server resolves
 * both differently from what actually ships.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html"], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      // Touch has no hover, which is the whole reason placement needs to explain itself
      // in text. Battle and theme rules do not vary by input device, and replaying the
      // full game on a second project would double the suite for nothing.
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /(placement|responsive)\.spec\.ts/,
    },
  ],
  webServer: {
    // Pin the host: vite preview otherwise binds ::1 only, which 127.0.0.1 cannot reach.
    command:
      "npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
