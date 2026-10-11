/**
 * Gemeinsame Wege durch das Onboarding (Plan 0033) für `onboarding.spec.ts` und `onboarding-push.spec.ts`. Zwei Specs,
 * weil `channel: "chromium"` (Schalter, E15) nur auf oberster Ebene einer Datei geht.
 */
import type { Page } from "@playwright/test";
import { expect } from "./fixtures.ts";

declare global {
  interface Window {
    /** vom synthetischen beforeinstallprompt mitgezählt */
    __prompted?: number;
  }
}

export const intro = (page: Page) => page.getByRole("dialog", { name: "Einführung" });
export const title = (page: Page) => intro(page).getByRole("heading", { level: 2 });
export const kicker = (page: Page) => intro(page).locator(".onb-kicker");
/** Hauptknopf unten: „Los geht’s“, „Weiter“ oder die Abschluss-Beschriftung */
export const primary = (page: Page) => intro(page).locator(".onb-foot .btn.primary");

/**
 * Kicker je Schritt (E10); der App-Schritt hat zwei Varianten. Schritt 1 heißt immer „Willkommen“, Stadt an Position 2
 * (iPhone im Safari-Tab) „Schön, dass ihr da seid“ (Plan 0034, E2).
 */
const KICKER = {
  stadt: /^(Willkommen|Schön, dass ihr da seid)$/,
  alter: "Passt zum Alter",
  weg: "Gut erreichbar",
  app: /^(Immer griffbereit|Samstags-Nachricht)$/,
} as const;
export type Step = keyof typeof KICKER;

/** Onboarding da und Schritt 1 fokussiert */
export async function opened(page: Page) {
  await page.goto("./");
  await expect(title(page)).toHaveText(/^Schritt 1 von \d: /);
  await expect(title(page)).toBeFocused();
}

/** Schritt n von m: Überschrift fokussiert (E3) */
export async function expectStep(page: Page, n: number, total: number) {
  await expect(title(page)).toHaveText(new RegExp(`^Schritt ${n} von ${total}: `));
  await expect(title(page)).toBeFocused();
}

/**
 * Mit dem Hauptknopf weiter, bis der Kicker zum Schritt passt. Auf dem iPhone trägt auch der App-Schritt 1
 * „Willkommen“, darum hält „stadt“ nur mit sichtbarer Gruppe „Stadt“ (Plan 0034, E2).
 */
export async function goTo(page: Page, step: Step) {
  for (let i = 0; i < 4; i++) {
    const text = (await kicker(page).textContent()) ?? "";
    const want = KICKER[step];
    const match = typeof want === "string" ? text === want : want.test(text);
    if (match && (step !== "stadt" || (await intro(page).getByRole("group", { name: "Stadt" }).isVisible()))) return;
    const before = await title(page).textContent();
    await primary(page).click();
    await expect(title(page)).not.toHaveText(before ?? "");
    await expect(title(page)).toBeFocused();
  }
  throw new Error(`Schritt ${step} nicht erreicht`);
}

/** Reihenfolge der Schritte aus den Kickern, bis zum letzten (ohne ihn zu beenden) */
export async function stepOrder(page: Page): Promise<string[]> {
  const order: string[] = [];
  const total = Number(/von (\d):/.exec((await title(page).textContent()) ?? "")?.[1]);
  for (let n = 1; n <= total; n++) {
    await expectStep(page, n, total);
    order.push((await kicker(page).textContent()) ?? "");
    if (n < total) await primary(page).click();
  }
  return order;
}

/** Synthetisches `beforeinstallprompt` nach dem PWA-Kern (Muster `installieren.spec.ts`) */
export async function offerInstall(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("data-pwa", "bereit");
  await page.evaluate(() => {
    window.__prompted = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        window.__prompted = (window.__prompted ?? 0) + 1;
      },
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    window.dispatchEvent(event);
  });
}
