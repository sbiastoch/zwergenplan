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

export async function expectTouchTargets(page: Page) {
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

/**
 * Große Schrift wie über die Browser-Einstellung (Plan 0007, E7): Die Wurzel-Schriftgröße wird gesetzt, danach
 * laufen Animationen aus und zwei Frames vergehen, damit Container-Queries und Umbrüche neu berechnet sind.
 */
export async function setTextScale(page: Page, scale: number) {
  await page.evaluate((s) => {
    document.documentElement.style.fontSize = `${s * 100}%`;
  }, scale);
  await settle(page);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

/** Leisten, deren Kinder nebeneinander bzw. untereinander stehen und sich nie überlappen dürfen (Prüfung 4). */
const BARS = [
  ".hdr",
  ".stickers",
  ".chips",
  ".tabs",
  ".week",
  ".mgrid",
  ".cal-nav",
  ".card-top",
  ".facts",
  ".two",
  ".sheetfoot",
  ".seg",
  ".labels",
  ".hero",
];

export interface TextFitOptions {
  /** Textgröße relativ zu 100 %; bei `2` dürfen Knöpfe zwischen Wörtern umbrechen (Prüfung 5 aus). */
  scale?: number;
  /** Prüfung 5 (kurze Knopf-Beschriftungen einzeilig). Mit echten Daten immer `false` (Plan 0007, E10). */
  buttons?: boolean;
}

/**
 * Text passt in seinen Kasten (Plan 0007, E10, Befund B7). Fünf Prüfungen in einem Durchgang:
 * 1. kein Bruch mitten in kurzen Wörtern, 2. kein Text ragt heraus oder wird abgeschnitten, 3. Text bleibt in
 * sichtbaren Rundungen, 4. Geschwister in Leisten überlappen nicht, 5. kurze Knopf-Beschriftungen einzeilig.
 * Ausnahmen gibt es nur als begründete Regel (Kommentare unten), nie per Selektor oder `data-`Attribut.
 */
export async function expectTextFits(page: Page, { scale = 1, buttons = true }: TextFitOptions = {}) {
  await settle(page);
  const problems = await page.evaluate(
    ({ bars, checkButtons }) => {
      const found: string[] = [];
      const px = (v: string) => Number.parseFloat(v) || 0;
      const name = (el: Element) =>
        `${el.tagName.toLowerCase()}${el.classList.length > 0 ? `.${el.classList[0]}` : ""}`;
      const short = (text: string) => {
        const t = text.replace(/\s+/g, " ").trim();
        return t.length > 40 ? `${t.slice(0, 39)}…` : t;
      };

      /*
       * Visuell versteckt (gilt für alle fünf Prüfungen): `display: none`, `visibility: hidden`, `clip`/`clip-path`
       * auf null oder ein Kasten ≤ 1 px, der seinen Inhalt abschneidet (`.sr-only`: Legenden „Kategorien“,
       * „Schnellfilter“, „Woche“, ausgeblendete Tab-Labels). Ein 0-px-Kasten ohne Abschneiden versteckt nichts:
       * Die `aria-live`-Hülle des Toasts ist 0 px hoch, der feste Toast darin aber sichtbar.
       */
      const hiddenCache = new Map<Element, boolean>();
      const isHidden = (el: Element | null): boolean => {
        if (!el || el === document.documentElement) return false;
        const cached = hiddenCache.get(el);
        if (cached !== undefined) return cached;
        const s = getComputedStyle(el);
        let hidden = s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse";
        if (!hidden && s.display !== "contents") {
          const r = el.getBoundingClientRect();
          const clips = s.overflowX !== "visible" || s.overflowY !== "visible";
          hidden =
            ((r.width <= 1 || r.height <= 1) && clips) ||
            s.clip === "rect(0px, 0px, 0px, 0px)" ||
            /inset\(50%\)/.test(s.clipPath);
        }
        hidden ||= isHidden(el.parentElement);
        hiddenCache.set(el, hidden);
        return hidden;
      };

      const rectsOf = (node: Text, start = 0, end = node.data.length) => {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        return [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      };
      /** Zeilen = verschiedene `top` der Rechtecke, Toleranz 2 px (gedrehte Kacheln, gemischte Schriftgrößen). */
      const lineCount = (rects: DOMRect[]) => {
        const tops: number[] = [];
        for (const r of rects) if (!tops.some((t) => Math.abs(t - r.top) <= 2)) tops.push(r.top);
        return tops.length;
      };

      // Paare aus Textknoten und Elternelement: So steht der Elternteil typsicher fest (ohne Cast).
      const texts: { text: Text; parent: Element }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const parent = n.parentElement;
        if (!(n instanceof Text) || !parent || n.data.trim() === "") continue;
        if (parent.closest("svg, script, style, noscript, template") || isHidden(parent)) continue;
        texts.push({ text: n, parent });
      }

      // 1. Kein Bruch mitten in kurzen Wörtern. Referenz ist die Textzeile der Seitenspalte (40 rem bei 16 px,
      //    je 16 px Rand), nicht der eigene Kasten: Der zu schmale Kasten (Tab, Knopf, Tageszelle) ist der Fehler.
      //    70 %: Lange Titel bei 200 % sind breiter als die Spalte und müssen brechen, kurze Wörter nie.
      const reference = Math.min(window.innerWidth, 640) - 32;
      for (const { text, parent } of texts) {
        // Ausnahme: `hyphens: auto` (Titel, Zusammenfassung) – dort trennt das Wörterbuch, nicht der Zufall.
        if (getComputedStyle(parent).hyphens === "auto") continue;
        // Wörter ohne Leerraum, Bindestrich und Gedankenstrich (dort ist Umbruch legitim). Der Schrägstrich ist
        // keine Umbruchstelle (UAX 14, Chromium und WebKit brechen dort nicht): „Gostenhof/Himpfelshof“ ist ein
        // langes Wort und darf bei 200 % brechen, nicht „Himpfelshof“ allein (echte Daten, Smoke).
        for (const m of text.data.matchAll(/[^\s\-‐–]+/g)) {
          const rects = rectsOf(text, m.index, m.index + m[0].length);
          if (lineCount(rects) < 2) continue;
          const width = rects.reduce((sum, r) => sum + r.width, 0);
          if (width <= 0.7 * reference)
            found.push(
              `Wort gebrochen: „${m[0]}“ in ${name(parent)} (${Math.round(width)} px ≤ 70 % von ${reference} px)`,
            );
        }
      }

      // 2. Text ragt nicht heraus: seitlich über keinen Innenrand (Padding-Kante) eines Vorfahren, senkrecht nur
      //    bei Vorfahren, die abschneiden (Ober-/Unterlängen ragen bei Zeilenhöhe 1,08 legitim aus dem Zeilenkasten).
      for (const { text, parent } of texts) {
        const rects = rectsOf(text);
        for (let a: Element | null = parent; a && a !== document.documentElement; a = a.parentElement) {
          const s = getComputedStyle(a);
          // Ende am ersten Scroll-Container: Text außerhalb des sichtbaren Bereichs ist dort Absicht (.chips).
          if (s.overflowX === "auto" || s.overflowX === "scroll") break;
          // Inline-Kästen entstehen aus dem Text selbst, `contents` hat keinen Kasten.
          if (s.display !== "inline" && s.display !== "contents") {
            const b = a.getBoundingClientRect();
            const left = b.left + px(s.borderLeftWidth);
            const right = b.right - px(s.borderRightWidth);
            const top = b.top + px(s.borderTopWidth);
            const bottom = b.bottom - px(s.borderBottomWidth);
            const clipsY = s.overflowY === "hidden" || s.overflowY === "clip";
            for (const r of rects) {
              if (r.left < left - 1.5 || r.right > right + 1.5) {
                found.push(`Text ragt aus ${name(a)}: „${short(text.data)}“ (${name(parent)})`);
                break;
              }
              if (clipsY && (r.top < top - 1.5 || r.bottom > bottom + 1.5)) {
                found.push(`Text abgeschnitten in ${name(a)}: „${short(text.data)}“ (${name(parent)})`);
                break;
              }
            }
          }
          // Nach dem ersten fest/absolut positionierten Vorfahren endet der Weg: Sein Bezug ist nicht der DOM-Vorfahr.
          if (s.position === "fixed" || s.position === "absolute") break;
        }
      }

      // 3. Text bleibt innerhalb der Rundung des nächsten Vorfahren, dessen Rundung sichtbar ist (Hintergrund,
      //    Bild oder Rand). Radien je Ecke, `%` aufgelöst und nach CSS-Regel skaliert, Innenradius = außen − Rand.
      const alpha = (color: string) => {
        if (color === "transparent") return 0;
        const m = color.match(/\/\s*([\d.]+%?)\s*\)$/) ?? color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+%?)\)$/);
        if (!m?.[1]) return 1;
        return m[1].endsWith("%") ? px(m[1]) / 100 : px(m[1]);
      };
      const sides = ["Top", "Right", "Bottom", "Left"] as const;
      const roundBox = (start: Element) => {
        for (let a: Element | null = start; a && a !== document.body; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.display === "inline" || s.display === "contents") continue;
          const radii = [
            s.borderTopLeftRadius,
            s.borderTopRightRadius,
            s.borderBottomRightRadius,
            s.borderBottomLeftRadius,
          ];
          if (radii.every((r) => px(r) === 0)) continue;
          const visible =
            alpha(s.backgroundColor) > 0 ||
            s.backgroundImage !== "none" ||
            sides.some((side) => px(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none");
          if (visible) return { el: a, s };
        }
        return undefined;
      };
      for (const { text, parent } of texts) {
        const box = roundBox(parent);
        if (!box) continue;
        const { s } = box;
        const b = box.el.getBoundingClientRect();
        const bw = {
          t: px(s.borderTopWidth),
          r: px(s.borderRightWidth),
          b: px(s.borderBottomWidth),
          l: px(s.borderLeftWidth),
        };
        const W = b.width;
        const H = b.height;
        const radius = (v: string) => {
          const [h = "0", w = h] = v.split(" ");
          const res = (x: string, size: number) => (x.endsWith("%") ? (px(x) / 100) * size : px(x));
          return { x: res(h, W), y: res(w, H) };
        };
        const tl = radius(s.borderTopLeftRadius);
        const tr = radius(s.borderTopRightRadius);
        const br = radius(s.borderBottomRightRadius);
        const bl = radius(s.borderBottomLeftRadius);
        const f = Math.min(
          1,
          W / (tl.x + tr.x || 1),
          W / (bl.x + br.x || 1),
          H / (tl.y + bl.y || 1),
          H / (tr.y + br.y || 1),
        );
        const left = b.left + bw.l;
        const right = b.right - bw.r;
        const top = b.top + bw.t;
        const bottom = b.bottom - bw.b;
        // Ecken: Bogenmittelpunkt, Innenradien und die Richtung, in der der Eckbereich liegt
        const corners = [
          {
            cx: left + Math.max(0, tl.x * f - bw.l),
            cy: top + Math.max(0, tl.y * f - bw.t),
            rx: Math.max(0, tl.x * f - bw.l),
            ry: Math.max(0, tl.y * f - bw.t),
            sx: -1,
            sy: -1,
          },
          {
            cx: right - Math.max(0, tr.x * f - bw.r),
            cy: top + Math.max(0, tr.y * f - bw.t),
            rx: Math.max(0, tr.x * f - bw.r),
            ry: Math.max(0, tr.y * f - bw.t),
            sx: 1,
            sy: -1,
          },
          {
            cx: right - Math.max(0, br.x * f - bw.r),
            cy: bottom - Math.max(0, br.y * f - bw.b),
            rx: Math.max(0, br.x * f - bw.r),
            ry: Math.max(0, br.y * f - bw.b),
            sx: 1,
            sy: 1,
          },
          {
            cx: left + Math.max(0, bl.x * f - bw.l),
            cy: bottom - Math.max(0, bl.y * f - bw.b),
            rx: Math.max(0, bl.x * f - bw.l),
            ry: Math.max(0, bl.y * f - bw.b),
            sx: -1,
            sy: 1,
          },
        ];
        outer: for (const r of rectsOf(text)) {
          for (const c of corners) {
            if (c.rx < 1 || c.ry < 1) continue;
            const x = c.sx < 0 ? r.left : r.right;
            const y = c.sy < 0 ? r.top : r.bottom;
            const dx = (x - c.cx) * c.sx;
            const dy = (y - c.cy) * c.sy;
            if (dx <= 0 || dy <= 0) continue; // Punkt liegt nicht im Eckbereich
            // Toleranz 1 px
            if ((dx / (c.rx + 1)) ** 2 + (dy / (c.ry + 1)) ** 2 > 1) {
              found.push(`Text stößt an die Rundung von ${name(box.el)}: „${short(text.data)}“`);
              break outer;
            }
          }
        }
      }

      // 4. Geschwister in Leisten überlappen nicht. offset* statt getBoundingClientRect: Drehungen (Kacheln ±0,6°,
      //    gewählter Tag −4°, Etiketten ±0,5°) blähen die Rechtecke sonst auf. Absolut/fest Positioniertes zählt nicht.
      for (const bar of document.querySelectorAll<HTMLElement>(bars)) {
        if (isHidden(bar)) continue;
        const items = [...bar.children].filter(
          (c): c is HTMLElement =>
            c instanceof HTMLElement &&
            c.offsetParent !== null &&
            c.offsetWidth > 0 &&
            !["absolute", "fixed"].includes(getComputedStyle(c).position),
        );
        for (const [i, a] of items.entries()) {
          for (const b of items.slice(i + 1)) {
            const w =
              Math.min(a.offsetLeft + a.offsetWidth, b.offsetLeft + b.offsetWidth) -
              Math.max(a.offsetLeft, b.offsetLeft);
            const h =
              Math.min(a.offsetTop + a.offsetHeight, b.offsetTop + b.offsetHeight) - Math.max(a.offsetTop, b.offsetTop);
            // offset* sind auf ganze Pixel gerundet (Kante und Breite je ±0,5 px): erst mehr als 1 px ist Überlappung.
            if (w > 1 && h > 1)
              found.push(
                `Überlappung in ${name(bar)}: ${name(a)} „${short(a.textContent ?? "")}“ und ${name(b)} „${short(b.textContent ?? "")}“`,
              );
          }
        }
      }

      // 5. Kurze Knopf-Beschriftungen (≤ 32 Zeichen) einzeilig. Längere kommen aus den Daten und dürfen umbrechen,
      //    Knöpfe in Überschriften sind Titel. Textknoten mit demselben Elternelement müssen auf einer Zeile liegen:
      //    React teilt „Nur {Tag}“ in zwei Knoten, bewusst gestapelte Spans („Mo“ über „5“) bleiben erlaubt.
      if (checkButtons) {
        for (const el of document.querySelectorAll<HTMLElement>("button, a[href], [role=button]")) {
          if (isHidden(el) || el.closest("h1, h2, h3, h4, h5, h6")) continue;
          if (el.tagName === "A" && getComputedStyle(el).display === "inline") continue;
          const label = (el.textContent ?? "").replace(/\s+/g, " ").trim();
          if (label === "" || label.length > 32) continue;
          const byParent = new Map<Element, DOMRect[]>();
          for (const { text, parent } of texts) {
            if (!el.contains(text)) continue;
            byParent.set(parent, [...(byParent.get(parent) ?? []), ...rectsOf(text)]);
          }
          if ([...byParent.values()].some((rects) => lineCount(rects) > 1))
            found.push(`Knopf-Beschriftung zweizeilig: „${label}“ (${name(el)})`);
        }
      }

      return [...new Set(found)].slice(0, 25);
    },
    { bars: BARS.join(", "), checkButtons: buttons && scale === 1 },
  );
  expect(problems, `Text passt in seinen Kasten (expectTextFits, ${scale * 100} %)`).toEqual([]);
}

/** Deckende Hintergründe heller als das im Dunkelmodus gelten als helle Insel (Plan 0007, E15). */
const MAX_DARK_LUMINANCE = 0.75;
const MAX_ISLAND_AREA = 1000;

/**
 * Dunkelmodus ohne helle Inseln (Plan 0007, E15, H4): Kein sichtbares Element und kein `::before`/`::after` ohne
 * `background-image` hat eine deckende Hintergrundfarbe (Alpha > 0,5) mit relativer Luminanz > 0,75 auf mehr als
 * 1 000 px². Gelb `#FFD93B` (0,71) und die Kategoriefarben liegen darunter, `#EEF3F8` (0,89) und Weiß darüber.
 */
export async function expectNoBrightIslands(page: Page) {
  await settle(page);
  const islands = await page.evaluate(
    ({ maxLuminance, maxArea }) => {
      const px = (v: string) => Number.parseFloat(v) || 0;
      /** [r, g, b] in 0..1 und Alpha; null bei unbekanntem Format (wird gemeldet statt still übergangen) */
      const parse = (color: string): [number, number, number, number] | null => {
        if (color === "transparent") return [0, 0, 0, 0];
        const rgb = color.match(/^rgba?\(([^)]+)\)$/);
        if (rgb?.[1]) {
          const [r = 0, g = 0, b = 0, a = 1] = rgb[1]
            .split(/[\s,/]+/)
            .filter(Boolean)
            .map((v) => (v.endsWith("%") ? px(v) / 100 : Number.parseFloat(v)));
          return [r / 255, g / 255, b / 255, a];
        }
        const srgb = color.match(/^color\(srgb ([^)]+)\)$/);
        if (srgb?.[1]) {
          const [r = 0, g = 0, b = 0, a = 1] = srgb[1]
            .split(/[\s/]+/)
            .filter(Boolean)
            .map((v) => (v.endsWith("%") ? px(v) / 100 : Number.parseFloat(v)));
          return [r, g, b, a];
        }
        return null;
      };
      const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const label = (el: Element, pseudo = "") =>
        `${el.tagName.toLowerCase()}${el.classList.length > 0 ? `.${[...el.classList].join(".")}` : ""}${pseudo}`;
      const found: string[] = [];
      const check = (el: Element, pseudo: string, s: CSSStyleDeclaration, area: number) => {
        if (s.backgroundImage !== "none" || area <= maxArea) return;
        const c = parse(s.backgroundColor);
        if (!c) {
          found.push(`${label(el, pseudo)}: unbekanntes Farbformat ${s.backgroundColor}`);
          return;
        }
        const [r, g, b, a] = c;
        if (a <= 0.5) return;
        const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        if (luminance > maxLuminance)
          found.push(
            `${label(el, pseudo)}: ${s.backgroundColor}, Luminanz ${luminance.toFixed(2)}, ${Math.round(area)} px²`,
          );
      };
      for (const el of document.querySelectorAll("body, body *")) {
        const s = getComputedStyle(el);
        if (s.visibility !== "visible" || el.closest("svg")) continue;
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        check(el, "", s, box.width * box.height);
        for (const pseudo of ["::before", "::after"]) {
          const p = getComputedStyle(el, pseudo);
          if (p.content === "none" || p.content === "normal" || p.display === "none") continue;
          // Fläche: aus width/height, sonst bei Positionierung per inset aus der Box des Elements geschätzt.
          let w = p.width.endsWith("px") ? px(p.width) : Number.NaN;
          let h = p.height.endsWith("px") ? px(p.height) : Number.NaN;
          if (Number.isNaN(w)) w = box.width - px(p.left) - px(p.right);
          if (Number.isNaN(h)) h = box.height - px(p.top) - px(p.bottom);
          check(el, pseudo, p, Math.max(0, w) * Math.max(0, h));
        }
      }
      return found.slice(0, 15);
    },
    { maxLuminance: MAX_DARK_LUMINANCE, maxArea: MAX_ISLAND_AREA },
  );
  expect(islands, "helle Inseln im Dunkelmodus (Luminanz > 0,75 auf > 1 000 px²)").toEqual([]);
}

/** Relative Luminanz der Hintergrundfarbe des ersten passenden Elements (gezielte Erwartungen, z. B. `.hint.ok`). */
export async function backgroundLuminance(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const c = getComputedStyle(el).backgroundColor;
      const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const rgb = c
        .match(/^rgba?\(([^)]+)\)$/)?.[1]
        ?.split(/[\s,/]+/)
        .map(Number.parseFloat)
        .map((v) => v / 255);
      const srgb = c
        .match(/^color\(srgb ([^)]+)\)$/)?.[1]
        ?.split(/[\s/]+/)
        .map(Number.parseFloat);
      const [r = Number.NaN, g = Number.NaN, b = Number.NaN] = rgb ?? srgb ?? [];
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    });
}

/** Alle schnellen Layout-Prüfungen auf einmal. `buttons: false` mit echten Daten (Plan 0007, E10, Prüfung 5). */
export async function expectMobileUx(page: Page, { buttons = true }: { buttons?: boolean } = {}) {
  await expectNoHorizontalScroll(page); // wartet per settle() auf Animationen
  await expectTouchTargets(page);
  await expectNoInputZoom(page);
  await expectTextFits(page, { scale: 1, buttons });
  await expectAccessible(page);
}
