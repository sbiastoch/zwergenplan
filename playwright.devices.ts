/**
 * Die Geräteprojekte der E2E-Suite, an einer Stelle (Plan 0027, Arch-Review Etappe 4, m5). playwright.config.ts baut
 * daraus die Suites, scripts/e2e-local.ts leitet daraus die Engine (PW_SUITE) eines Projekts ab.
 */
import { devices, type PlaywrightTestProject as Project } from "@playwright/test";

export const common = { locale: "de-DE", timezoneId: "Europe/Berlin" } as const;

export const deviceProjects: Project[] = [
  // Mobile zuerst: das sind die maßgeblichen Geräte.
  { name: "android-klein", use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 640 }, ...common } },
  { name: "pixel-7", use: { ...devices["Pixel 7"], ...common } },
  { name: "iphone-15", use: { ...devices["iPhone 15"], ...common } },
  { name: "pixel-7-quer", use: { ...devices["Pixel 7 landscape"], ...common } },
  { name: "desktop", use: { ...devices["Desktop Chrome"], ...common } },
];

/** Engine eines Geräteprojekts, `undefined` bei unbekanntem Namen. */
export function engineOf(name: string): string | undefined {
  return deviceProjects.find((p) => p.name === name)?.use?.defaultBrowserType;
}
