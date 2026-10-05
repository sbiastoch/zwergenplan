/**
 * Wahl des size-adjust je Stack und Gewichtsbereich (Plan 0007, E11), rein und testbar; das Messen macht
 * scripts/font-fallback.ts.
 */

/** Gemessenes Breitenverhältnis Bricolage/Fallback einer Textklasse */
export interface ClassRatio {
  name: string;
  weight: number;
  /** Stack, der die Klasse setzt: Text (--font-sans) oder Überschrift (--font-display) */
  stack: "text" | "display";
  /** kann beim Laden umbrechen und zählt deshalb für die Wahl */
  fit: boolean;
  ratio: number;
}

export interface WeightRange {
  min: number;
  max: number;
}

export interface AdjustChoice {
  /** gewähltes size-adjust als Faktor, auf drei Nachkommastellen (0,1 %) gerundet */
  adjust: number;
  /** Klassen, die den Wert bestimmt haben */
  basis: ClassRatio[];
  /** Klassen für den Bericht: die des Stacks im Bereich, sonst die Basis */
  shown: ClassRatio[];
}

/**
 * - Basis sind die umbrechenden Klassen (`fit`) des Stacks im Gewichtsbereich. Hat der Stack dort keine, gilt der
 *   Text-Stack (der Display-Stack hat nur 750–800 eigene Klassen; `small` in .daylabel ist Text).
 * - Gewählt wird die Mitte zwischen kleinstem und größtem Verhältnis: Sie hält den größten Fehler klein.
 * - Ohne Basis wirft die Funktion, statt still einen Wert zu erfinden.
 */
export function chooseAdjust(
  ratios: readonly ClassRatio[],
  stack: ClassRatio["stack"],
  range: WeightRange,
): AdjustChoice {
  const inRange = ratios.filter((r) => r.weight >= range.min && r.weight <= range.max);
  const own = inRange.filter((r) => r.stack === stack);
  const basis = (own.some((r) => r.fit) ? own : inRange.filter((r) => r.stack === "text")).filter((r) => r.fit);
  if (basis.length === 0)
    throw new Error(`keine umbrechende Klasse für ${stack} ${range.min}–${range.max}, size-adjust nicht bestimmbar`);
  const values = basis.map((r) => r.ratio);
  const adjust = Math.round(((Math.min(...values) + Math.max(...values)) / 2) * 1000) / 1000;
  return { adjust, basis, shown: own.length > 0 ? own : basis };
}
