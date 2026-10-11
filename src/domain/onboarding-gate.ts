/**
 * Erscheint das Onboarding beim Start (Plan 0033, E2; Plan 0035, E3)? Rein und im Start-Bundle; `App` entscheidet damit
 * synchron im `useState`-Initializer. Die Texte und Schritte liegen in `onboarding.ts` (nur im Lazy-Chunk).
 *
 * - `zeigen`: Start ohne gültiges Flag, auch für Bestandsnutzer mit gespeicherten Angaben (sie stehen im Flow
 *   vorbelegt). Ob etwas gespeichert ist, spielt keine Rolle, also verrät auch kein Request es.
 * - `nichts`: schon erledigt, Deep-Link (zuerst der Inhalt) oder kein nutzbarer Speicher (sonst käme es bei jedem
 *   Besuch, Arch-Review m3)
 */
export type OnboardingGate = "zeigen" | "nichts";

export function onboardingGate(g: { storage: boolean; done: boolean; deepLink: boolean }): OnboardingGate {
  return !g.storage || g.done || g.deepLink ? "nichts" : "zeigen";
}
