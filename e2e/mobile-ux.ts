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

/** Höchstdauer einer Animation oder Transition bei reduzierter Bewegung (Dauer + Verzögerung). */
const MAX_REDUCED_MS = 1;

/**
 * Erst messen, wenn endliche Animationen (Einkleben, Plop, Aufklappen) durch sind: Mitten in
 * `scale(.98)` ist ein 44-px-Knopf 43 px groß.
 * Ursache, warum das trotz `expectReducedMotion` nötig bleibt: Nicht alle Gates emulieren
 * `prefers-reduced-motion` (z. B. der Smoke-Test mit echten Daten und die Fokusprüfung), dort laufen die
 * Animationen in voller Länge. Auch mit 0,01 ms endet eine Animation erst mit dem nächsten Frame, settle()
 * wartet genau diesen Frame ab. Endlos-Animationen (Wackeln im Leerzustand) zählen nicht.
 */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

export async function expectNoHorizontalScroll(page: Page) {
  await settle(page);
  const result = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    // Verursacher benennen, damit der Fehler ohne Debugging behebbar ist (clientWidth: ohne Scrollleiste).
    const width = document.documentElement.clientWidth;
    const culprits = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => el.getBoundingClientRect().right > width + 0.5)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ")[0]}` : ""} (rechts ${Math.round(el.getBoundingClientRect().right)} > ${width})`,
      )
      .slice(0, 5);
    return { overflow, culprits };
  });
  expect(
    result.overflow,
    `kein horizontales Scrollen – Verursacher: ${result.culprits.join(", ")}`,
  ).toBeLessThanOrEqual(0);
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

/**
 * Mit `prefers-reduced-motion: reduce` dauert keine Animation und keine Transition länger als 1 ms,
 * Verzögerung eingerechnet (docs/architecture.md, „Mobile-UX-Gates“). Geprüft werden die laufenden
 * Animationen (`document.getAnimations()`) und die berechneten Stile aller Elemente samt `::before`/`::after`,
 * damit auch erst später ausgelöste Bewegung (Hover, Aufklappen) auffällt. Aufrufer emulieren `reducedMotion`.
 */
export async function expectReducedMotion(page: Page) {
  const offenders = await page.evaluate((maxMs) => {
    const ms = (value: string) =>
      Math.max(
        ...value.split(",").map((part) => {
          const v = part.trim();
          const parsed = v.endsWith("ms") ? Number.parseFloat(v) : Number.parseFloat(v) * 1000;
          // Unbekannte Werte (z. B. `auto` aus CSS Animations 2) zählen als Verstoß, statt als NaN still durchzugehen.
          return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
        }),
      );
    const label = (el: Element, pseudo = "") =>
      `${el.tagName.toLowerCase()}${el.classList.length > 0 ? `.${[...el.classList].join(".")}` : ""}${pseudo}`;
    const found: string[] = [];
    for (const animation of document.getAnimations()) {
      const timing = animation.effect?.getComputedTiming();
      const total = Number(timing?.delay ?? 0) + Number(timing?.activeDuration ?? 0);
      if (total > maxMs) {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        const name = animation instanceof CSSAnimation ? animation.animationName : "Animation";
        found.push(`läuft: ${name} auf ${target ? label(target) : "?"} (${Math.round(total)} ms)`);
      }
    }
    for (const el of document.querySelectorAll("*")) {
      for (const pseudo of ["", "::before", "::after"]) {
        const s = getComputedStyle(el, pseudo || null);
        const animation = s.animationName === "none" ? 0 : ms(s.animationDuration) + ms(s.animationDelay);
        const transition = ms(s.transitionDuration) + ms(s.transitionDelay);
        if (animation > maxMs)
          found.push(`Stil: animation ${s.animationName} auf ${label(el, pseudo)} (${animation} ms)`);
        if (transition > maxMs) found.push(`Stil: transition auf ${label(el, pseudo)} (${transition} ms)`);
      }
    }
    return [...new Set(found)].slice(0, 10);
  }, MAX_REDUCED_MS);
  expect(offenders, "Bewegung trotz prefers-reduced-motion (Dauer + Verzögerung > 1 ms)").toEqual([]);
}

/** Alle schnellen Layout-Prüfungen auf einmal. */
export async function expectMobileUx(page: Page) {
  await expectNoHorizontalScroll(page); // wartet per settle() auf Animationen
  await expectTouchTargets(page);
  await expectNoInputZoom(page);
  await expectAccessible(page);
}
