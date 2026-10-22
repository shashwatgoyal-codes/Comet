import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build (`next build && next
 * start`), not the dev server, so they exercise what actually ships.
 *
 * COMET_FAKE_EXTERNALS swaps Mapbox and Razorpay for deterministic fakes
 * behind the same interfaces (docs/TESTING.md); it's never set in a real
 * deployment.
 */
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Each test drives one or two browsers against one shared server; past
  // four at once, server round trips slow enough to flake.
  workers: 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Steps wait on server round trips while two browsers per test and
  // several tests share one server; 5 s (the default) flakes under that load.
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    // Location granted at HSR Layout (the app's own fallback), so the
    // first-launch location screen doesn't cover pages under test. Tests
    // that need another spot make their own context; the location screen
    // itself is tested in a context with no permission.
    permissions: ["geolocation"],
    geolocation: { latitude: 12.9116, longitude: 77.6474 },
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Fake maps and payments, and no Mapbox token, so the drawn map is used and
    // routes are deterministic. An env var set here beats .env.local.
    env: { COMET_FAKE_EXTERNALS: "1", NEXT_PUBLIC_MAPBOX_TOKEN: "" },
  },
});
