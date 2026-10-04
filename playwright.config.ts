import { defineConfig, devices } from "@playwright/test";
import { BASE } from "./site.config.ts";

// Eigener Port je Worktree (PW_PORT=4273 …), damit parallele Läufe nicht per reuseExistingServer
// den Server – und damit den Build – eines anderen Worktrees testen.
const FIXTURE_PORT = Number(process.env["PW_PORT"] ?? 4173);
const REAL_PORT = FIXTURE_PORT + 1;
const common = { locale: "de-DE", timezoneId: "Europe/Berlin" } as const;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "test-results",
  use: { baseURL: `http://localhost:${FIXTURE_PORT}${BASE}`, trace: "retain-on-failure", ...common },
  projects: [
    // Mobile zuerst: das sind die maßgeblichen Geräte.
    { name: "android-klein", use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 640 }, ...common } },
    { name: "pixel-7", use: { ...devices["Pixel 7"], ...common } },
    { name: "iphone-15", use: { ...devices["iPhone 15"], ...common } },
    { name: "pixel-7-quer", use: { ...devices["Pixel 7 landscape"], ...common } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...common } },
    {
      name: "smoke-echte-daten",
      testMatch: /smoke\.spec\.ts/,
      testIgnore: [],
      // Läuft allein und seriell nach allen anderen: Der LCP-Check mit 4× gedrosselter CPU misst sonst die
      // Konkurrenz paralleler Worker statt der Seite (Plan 0003, E8). Einzeln: --project=smoke-echte-daten --no-deps
      dependencies: ["android-klein", "pixel-7", "iphone-15", "pixel-7-quer", "desktop"],
      fullyParallel: false,
      use: { ...devices["Pixel 7"], baseURL: `http://localhost:${REAL_PORT}${BASE}`, ...common },
    },
  ],
  // smoke.spec.ts läuft nur im Projekt mit echten Daten (überschreibt dort testIgnore).
  testIgnore: /smoke\.spec\.ts/,
  webServer: [
    {
      command: `pnpm exec vite preview --strictPort --port ${FIXTURE_PORT} --outDir dist-e2e`,
      url: `http://localhost:${FIXTURE_PORT}${BASE}`,
      reuseExistingServer: !process.env["CI"],
    },
    {
      command: `pnpm exec vite preview --strictPort --port ${REAL_PORT} --outDir dist`,
      url: `http://localhost:${REAL_PORT}${BASE}`,
      reuseExistingServer: !process.env["CI"],
    },
  ],
});
