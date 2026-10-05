import { defineConfig, devices, type PlaywrightTestProject as Project } from "@playwright/test";
import { BASE } from "./site.config.ts";

// Eigener Port je Worktree (PW_PORT=4273 …), damit parallele Läufe nicht per reuseExistingServer
// den Server – und damit den Build – eines anderen Worktrees testen.
const FIXTURE_PORT = Number(process.env["PW_PORT"] ?? 4173);
const REAL_PORT = FIXTURE_PORT + 1;
const common = { locale: "de-DE", timezoneId: "Europe/Berlin" } as const;

/** CI teilt E2E nach Engine (Plan 0013). Ohne PW_SUITE läuft alles, wie lokal üblich. */
const SUITE = process.env["PW_SUITE"] || undefined; // undefined | "chromium" | "webkit" | "smoke"
/** Engines mit eigener, geshardeter Suite und Matrix-Einträgen in .github/workflows/ci.yml. */
const ENGINES: readonly string[] = ["chromium", "webkit"];

const deviceProjects: Project[] = [
  // Mobile zuerst: das sind die maßgeblichen Geräte.
  { name: "android-klein", use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 640 }, ...common } },
  { name: "pixel-7", use: { ...devices["Pixel 7"], ...common } },
  { name: "iphone-15", use: { ...devices["iPhone 15"], ...common } },
  { name: "pixel-7-quer", use: { ...devices["Pixel 7 landscape"], ...common } },
  { name: "desktop", use: { ...devices["Desktop Chrome"], ...common } },
];

// Wächter (Plan 0013, E2), immer, auch lokal: Ein Gerät ohne CI-Suite fiele dort still heraus, und
// Abhängigkeiten liefen in jedem Shard komplett mit (Playwright shardet nur die Projekte selbst).
for (const project of deviceProjects) {
  const engine = project.use?.defaultBrowserType;
  if (engine === undefined || !ENGINES.includes(engine)) {
    throw new Error(
      `Projekt ${project.name}: Engine ${engine} hat keine CI-Suite. PW_SUITE hier und die Matrix in .github/workflows/ci.yml ergänzen (Plan 0013).`,
    );
  }
  if (project.dependencies?.length) {
    throw new Error(
      `Projekt ${project.name}: dependencies in einer geshardeten Suite laufen in jedem Shard komplett mit (Plan 0013, E2).`,
    );
  }
}

// Echte Daten gegen den Deploy-Build. Läuft allein und seriell, sonst misst der LCP-Check mit 4× gedrosselter CPU
// die Konkurrenz paralleler Worker statt der Seite (Plan 0003, E8). workers: 1 hält auch smoke.spec.ts und
// font-swap.smoke.spec.ts auseinander. Lokal (ohne PW_SUITE) läuft es über dependencies nach allen Geräten,
// in CI im eigenen Job über PW_SUITE=smoke (Plan 0013). Einzeln: PW_SUITE=smoke pnpm exec playwright test
const smokeProject: Project = {
  name: "smoke-echte-daten",
  testMatch: /smoke\.spec\.ts/,
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  use: { ...devices["Pixel 7"], baseURL: `http://localhost:${REAL_PORT}${BASE}`, ...common },
};

function selectProjects(): Project[] {
  if (SUITE === undefined) {
    return [...deviceProjects, { ...smokeProject, dependencies: deviceProjects.map((p) => p.name ?? "") }];
  }
  if (SUITE === "smoke") return [smokeProject];
  if (!ENGINES.includes(SUITE)) {
    throw new Error(`PW_SUITE=${SUITE} ist unbekannt. Erlaubt: ${[...ENGINES, "smoke"].join(", ")} oder leer.`);
  }
  const selected = deviceProjects.filter((p) => p.use?.defaultBrowserType === SUITE);
  if (selected.length === 0) throw new Error(`PW_SUITE=${SUITE} wählt kein Projekt aus.`);
  return selected;
}

const projects = selectProjects();
const fixtureServer = {
  command: `pnpm exec vite preview --strictPort --port ${FIXTURE_PORT} --outDir dist-e2e`,
  url: `http://localhost:${FIXTURE_PORT}${BASE}`,
  reuseExistingServer: !process.env["CI"],
};
const realServer = {
  command: `pnpm exec vite preview --strictPort --port ${REAL_PORT} --outDir dist`,
  url: `http://localhost:${REAL_PORT}${BASE}`,
  reuseExistingServer: !process.env["CI"],
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://localhost:${FIXTURE_PORT}${BASE}`,
    trace: "retain-on-failure",
    // Kein Service Worker, außer eine Spec erlaubt ihn (Plan 0011, E6): Sonst lieferte er Fixture-Daten eines
    // früheren Tests, und context.route sähe seine Requests je nach Browser anders. Gilt für alle Suites (Plan 0013).
    serviceWorkers: "block",
    ...common,
  },
  projects,
  // smoke.spec.ts läuft nur im Projekt mit echten Daten (überschreibt dort testIgnore).
  testIgnore: /smoke\.spec\.ts/,
  // Nur die Server, die die gewählte Suite braucht: Geräte nutzen dist-e2e/, Smoke nutzt dist/.
  webServer: [
    ...(SUITE === "smoke" ? [] : [fixtureServer]),
    ...(SUITE === undefined || SUITE === "smoke" ? [realServer] : []),
  ],
});
