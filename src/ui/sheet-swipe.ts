/**
 * Sheets von unten nach unten wegwischen (Plan 0060, E2): reine Entscheidung `swipeOutcome` und der Hook
 * `useSheetSwipe`, den `Dialog` für Sheets mit Griff nutzt. Esc/Zurück und der Backdrop-Tipp bleiben der Weg ohne
 * Geste (E4).
 */
import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

/** Weite (px), ab der ein langsamer Wisch schließt; bei kleinen Sheets ein Viertel der Höhe */
const MAX_DISTANCE = 120;
/** Mindestweite (px) und -tempo (px/ms) eines schnellen Wischs */
const FLICK_DISTANCE = 24;
const FLICK_SPEED = 0.5;
/** Weg (px), ab dem die Richtung der Geste entschieden wird */
const DECIDE_PX = 8;
/** Dauer (ms) von Ausgleiten und Zurückfedern */
const SETTLE_MS = 200;

export function swipeOutcome({ dy, ms, height }: { dy: number; ms: number; height: number }): "close" | "stay" {
  if (dy > Math.min(MAX_DISTANCE, height * 0.25)) return "close";
  return dy > FLICK_DISTANCE && dy / Math.max(ms, 1) > FLICK_SPEED ? "close" : "stay";
}

/** Nur Sheets von unten mit Griff (`sheet`, `over-map`) wischen; Vollbild-Detail und Onboarding nicht (E3) */
export function swipesFor(className: string): boolean {
  return className.split(/\s+/).some((c) => c === "sheet" || c === "over-map");
}

/** Steht das Ziel in einem gescrollten Bereich des Dialogs? Dann scrollt der Finger Inhalt, er wischt nicht. */
function scrolledAbove(target: Element, dialog: Element): boolean {
  for (let el: Element | null = target; el && el !== dialog; el = el.parentElement) if (el.scrollTop > 0) return true;
  return false;
}

/**
 * Hängt die Geste an `ref` (ein `<dialog>`), solange `onSwipe` gesetzt ist. Die erste Bewegung entscheidet: nach unten
 * und eher senkrecht → Wisch, ab dann `preventDefault()` (der Inhalt scrollt nicht mit); sonst verworfen.
 */
export function useSheetSwipe(ref: RefObject<HTMLElement | null>, onSwipe: (() => void) | undefined) {
  // Der Rückruf ist meist bei jedem Render neu: über einen Ref, sonst hängte sich die Geste neu an und bräche einen
  // laufenden Schließ-Timer ab
  const latest = useRef(onSwipe);
  useLayoutEffect(() => {
    latest.current = onSwipe;
  });
  const enabled = onSwipe !== undefined;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let start: { x: number; y: number; t: number } | undefined;
    let dragging = false;
    let dy = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closing = false;
    const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    const move = (y: number | string, animate: boolean) => {
      el.style.transition = animate && !reduced() ? `transform ${SETTLE_MS}ms ease-out` : "none";
      el.style.transform = y === 0 ? "" : `translateY(${typeof y === "number" ? `${y}px` : y})`;
    };
    const reset = () => {
      closing = false;
      el.style.transition = "";
      el.style.transform = "";
    };
    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const target = e.target instanceof Element ? e.target : null;
      // Während das Sheet ausgleitet, zählt keine neue Berührung (sonst holte ein Zug es wieder hoch)
      if (closing) return;
      // Ein laufendes Zurückfedern endet hier (sein Timer setzte sonst mitten im neuen Zug zurück), und ein durch einen
      // zweiten Finger abgebrochener Zug hinterlässt keinen Versatz (Arch-Review Plan 0060, m1)
      clearTimeout(timer);
      reset();
      start = undefined;
      dragging = false;
      if (!touch || !target || e.touches.length > 1) return;
      if (target.closest("input, select, textarea") || scrolledAbove(target, el)) return;
      // Backdrop trifft ebenfalls das <dialog>: nur Berührungen im Sheet selbst
      const r = el.getBoundingClientRect();
      if (touch.clientY < r.top || touch.clientY > r.bottom || touch.clientX < r.left || touch.clientX > r.right)
        return;
      // Die Öffnungsanimation (`up`) steht über dem Inline-transform: beenden, sonst spränge das Sheet danach
      for (const a of el.getAnimations()) a.finish();
      start = { x: touch.clientX, y: touch.clientY, t: e.timeStamp };
    };
    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!start || !touch) return;
      dy = touch.clientY - start.y;
      if (!dragging) {
        const dx = Math.abs(touch.clientX - start.x);
        // Entschieden wird erst ab DECIDE_PX Weg: iOS meldet schon 1 px, ein Zittern bräche den Wisch sonst ab.
        // Bis dahin abwärts schon preventDefault (Chrome lässt touchmove nach Scrollbeginn nicht mehr abbrechen),
        // aufwärts nie (sonst bräche iOS das Scrollen der ganzen Geste ab).
        if (Math.hypot(dx, dy) <= DECIDE_PX) {
          if (dy > 0) e.preventDefault();
          return;
        }
        if (dy <= 0 || dx >= dy) {
          start = undefined;
          return;
        }
        dragging = true;
      }
      e.preventDefault();
      move(Math.max(0, dy), false);
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || !dragging) return;
      const outcome =
        e.type === "touchend" ? swipeOutcome({ dy, ms: e.timeStamp - start.t, height: el.offsetHeight }) : "stay";
      start = undefined;
      dragging = false;
      move(outcome === "stay" ? 0 : "100%", true);
      closing = outcome === "close";
      clearTimeout(timer);
      timer = setTimeout(
        () => {
          // Geschlossen setzt `close` zurück (unten): sofort zurückgesetzt blitzte das Sheet vor dem Schließen auf
          if (outcome === "close") latest.current?.();
          else reset();
        },
        reduced() ? 0 : SETTLE_MS,
      );
    };
    el.addEventListener("close", reset);
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("close", reset);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      reset();
    };
  }, [ref, enabled]);
}
