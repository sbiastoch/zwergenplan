/**
 * Mobile-UX-Backpressure: wiederverwendbare Prüfungen, die jede Ansicht bestehen muss.
 * Begründungen in docs/architecture.md („Mobile-UX-Gates“).
 */
import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Mindestgröße für Bedienelemente (Apple HIG / Material: 44–48 px). */
const MIN_TOUCH = 44;
/** WCAG 2.2 AA (2.5.8) für Links im Fließtext. */
const MIN_INLINE = 24;

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "kein horizontales Scrollen").toBeLessThanOrEqual(0);
}

async function expectTouchTargets(page: Page) {
  const offenders = await page.evaluate(
    ({ minTouch, minInline }) => {
      const selector = "a[href], button, input, select, textarea, [role=button], [tabindex]:not([tabindex='-1'])";
      return [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((el) => el.offsetParent !== null)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
          const min = inline ? minInline : minTouch;
          return r.width < min || r.height < min
            ? `${el.tagName.toLowerCase()} „${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 40)}“ ${Math.round(r.width)}×${Math.round(r.height)} (min ${min})`
            : null;
        })
        .filter((x): x is string => x !== null);
    },
    { minTouch: MIN_TOUCH, minInline: MIN_INLINE },
  );
  expect(offenders, "Touch-Ziele zu klein").toEqual([]);
}

/** iOS zoomt bei Eingabefeldern < 16 px ungefragt hinein. */
async function expectNoInputZoom(page: Page) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("input, select, textarea")]
      .filter((el) => Number.parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(small, "Eingabefelder mit Schrift < 16 px").toEqual([]);
}

export async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}×)`),
    "axe (WCAG 2.2 AA)",
  ).toEqual([]);
}

/** Jedes per Tab erreichbare Element zeigt einen sichtbaren Fokus. */
export async function expectVisibleFocus(page: Page, maxTabs = 40) {
  const missing: string[] = [];
  await page.locator("body").focus();
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      // Fokus hat die Seite verlassen (Browser-Oberfläche) → Durchlauf beendet.
      if (!el || el === document.body || !document.hasFocus() || !el.matches(":focus")) return null;
      const s = getComputedStyle(el);
      const visible = (s.outlineStyle !== "none" && Number.parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
      return { visible, label: `${el.tagName.toLowerCase()} „${(el.textContent ?? "").trim().slice(0, 30)}“` };
    });
    if (!info) break;
    if (!info.visible) missing.push(info.label);
  }
  expect(missing, "Elemente ohne sichtbaren Fokus").toEqual([]);
}

/** Alle schnellen Layout-Prüfungen auf einmal. */
export async function expectMobileUx(page: Page) {
  await expectNoHorizontalScroll(page);
  await expectTouchTargets(page);
  await expectNoInputZoom(page);
  await expectAccessible(page);
}
