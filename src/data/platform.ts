/**
 * Plattform-Prüfung im Start-Bundle (Plan 0034, E8): Die Ladebühne des Onboardings braucht vor dem App-Chunk die Farbe
 * der ersten Bühne, und im Safari-Tab des iPhones ist das „App“. `src/data/pwa.ts` (Lazy-Chunk) nutzt dieselben
 * Funktionen, so gibt es die Prüfung einmal.
 *
 * Liest `display-mode` nur lesend, ohne Listener, ohne `beforeinstallprompt` und Registrierung: Ausnahme von ADR 0013,
 * Punkt 5 (Nachtrag 2026-10-11, Muster ADR 0014, Punkt 6).
 */

/**
 * iPhone/iPad, heuristisch (Plan 0011, E7): iPadOS meldet sich als Mac, nur die Touch-Punkte verraten es. Keine
 * Versionsprüfung: iOS 26 meldet im UA eingefroren `iPhone OS 18_7` (Spike). Fällt die Erkennung falsch aus, sieht man
 * nur einen Hilfetext bzw. eine andere Farbe der Ladebühne.
 */
export function isIosDevice({ userAgent, maxTouchPoints }: { userAgent: string; maxTouchPoints: number }): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** Läuft als installierte App (`display-mode: standalone` bzw. `navigator.standalone` auf iOS)? */
export function standalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}

/** iPhone/iPad im Browser-Tab: genau dann liefert `install.state()` „ios“ (dort kommen keine Chromium-Events). */
export function iosTab(): boolean {
  return !standalone() && isIosDevice(navigator);
}
