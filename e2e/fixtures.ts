/**
 * Gemeinsame E2E-Basis: eingefrorene Zeit (Fixture-„Jetzt“) und
 * Konsolenfehler/Seitenfehler machen jeden Test automatisch rot.
 */
import { test as base, expect } from "@playwright/test";

/** Muss zu tests/fixtures/offers.json passen: Montag, 5.10.2026, 12:00 Berlin. */
const FIXTURE_NOW = new Date("2026-10-05T12:00:00+02:00");

export const test = base.extend<{ consoleGuard: undefined }>({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(FIXTURE_NOW);
    await use(page);
  },
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") problems.push(`console.error: ${msg.text()}`);
      });
      page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
      await use(undefined);
      expect(problems, "Keine Konsolen- oder Seitenfehler").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
