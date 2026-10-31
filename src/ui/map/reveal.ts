/**
 * Gewählten Punkt über dem Sheet halten (Plan 0059, E5): In der großen Karte deckt ein Sheet von unten etwa 60 % ab.
 * Liegt der getippte Ort tiefer als `REVEAL_LIMIT`, fährt die Karte ihn auf `REVEAL_TARGET` der Höhe.
 */

/** Unterhalb davon (Anteil der Kartenhöhe von oben) verdeckt das Sheet den Punkt. */
export const REVEAL_LIMIT = 0.38;
/** Ziel: Anteil der Kartenhöhe von oben */
export const REVEAL_TARGET = 0.25;

/**
 * Versatz für `easeTo({ center: punkt, offset })` in Pixeln, relativ zur Mitte der Karte; `undefined`, wenn der Punkt
 * (`y` in Pixeln von oben) schon sichtbar ist.
 */
export function revealOffset(y: number, height: number): [number, number] | undefined {
  if (height <= 0 || y <= height * REVEAL_LIMIT) return undefined;
  return [0, height * REVEAL_TARGET - height / 2];
}
