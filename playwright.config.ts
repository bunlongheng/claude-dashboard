import { defineConfig, devices } from "@playwright/test";

// The dashboard runs on port 3003 (a LaunchAgent keeps a dev server alive).
// reuseExistingServer means Playwright attaches to it instead of spawning a
// second one; if it is down, Playwright starts `npm run dev` itself.
const PORT = 3003;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000, // Turbopack dev compiles routes on-demand (first hit is slow)
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Single worker: the dev server compiles one route at a time, so parallel
  // workers just thrash the compile queue and cause timeouts.
  workers: 1,
  retries: 1,
  reporter: [["list"]],
  use: {
    // public/sw.js serves GET requests itself, and service worker fetches bypass
    // page.route(), so every API mock in the specs would be skipped without this.
    serviceWorkers: "block",
    baseURL: BASE_URL,
    headless: true,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // NOTE: the dev server on 3003 is managed externally by a launchd LaunchAgent
  // (com.yourname.claude, KeepAlive). We intentionally do NOT use Playwright's
  // `webServer` locally: letting Playwright spawn a second `next dev` on 3003
  // fights the LaunchAgent for the port and crash-loops both. E2E attaches to
  // the already-running server at baseURL instead.
  // In CI there is no LaunchAgent, so Playwright builds and starts its own
  // production server on 3003.
  ...(process.env.CI
    ? {
        webServer: {
          command: "npm run build && npm run start -- -p 3003",
          url: BASE_URL,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }
    : {}),
});
