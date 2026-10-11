/**
 * Erscheint das Onboarding beim Start (Plan 0033, E2)? Rein und im Start-Bundle; `App` entscheidet damit synchron im
 * `useState`-Initializer. Die Texte und Schritte liegen in `onboarding.ts` (nur im Lazy-Chunk).
 *
 * - `zeigen`: erster Start ohne gespeicherte Angaben
 * - `still-erledigt`: Bestandsnutzer mit gespeicherten Angaben; das Flag wird still gesetzt, nichts erscheint. Der
 *   Chunk lädt trotzdem, damit kein Request verrät, ob etwas gespeichert ist (Review H1).
 * - `nichts`: schon erledigt, Deep-Link (zuerst der Inhalt) oder kein nutzbarer Speicher (sonst käme es bei jedem
 *   Besuch, Arch-Review m3)
 */
export type OnboardingGate = "zeigen" | "still-erledigt" | "nichts";

export function onboardingGate(g: {
  storage: boolean;
  done: boolean;
  stored: boolean;
  deepLink: boolean;
}): OnboardingGate {
  if (!g.storage || g.done || g.deepLink) return "nichts";
  return g.stored ? "still-erledigt" : "zeigen";
}
