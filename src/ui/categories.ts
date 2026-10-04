/**
 * Darstellung der 12 Kategorien: Kurzlabel für die Sticker-Leiste und eine eigene Form (SVG-Pfad,
 * 24er-Raster) – überall gleich. Die Farbe kommt aus CSS (`.k-<kategorie>`, styles.css).
 * Quelle: docs/design/stickerheft-mockup.html (SHAPES, CATS).
 */
import { type Category, categoriesOf, type Topic } from "../domain/topics.ts";

const SHAPES = {
  circle: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z",
  square: "M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z",
  flower:
    "M12 2a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 14a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM2 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0zM14 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0zM12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z",
  triangle: "M12 3l10 17H2z",
  drop: "M12 2c4 5 7 8.5 7 12a7 7 0 0 1-14 0c0-3.5 3-7 7-12z",
  star: "M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z",
  hexagon: "M12 2l8.7 5v10L12 22l-8.7-5V7z",
  diamond: "M12 2l10 10-10 10L2 12z",
  arch: "M4 21V11a8 8 0 0 1 16 0v10z",
  sparkle: "M12 1c1 6 5 10 11 11-6 1-10 5-11 11-1-6-5-10-11-11 6-1 10-5 11-11z",
  leaf: "M4 20C4 9 10 4 21 3c-1 11-6 17-17 17z",
  plus: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
} as const;

export const CATEGORY_UI: Record<Category, { short: string; shape: string }> = {
  babykurse: { short: "Babykurse", shape: SHAPES.circle },
  "krabbel-spielgruppen": { short: "Krabbeln", shape: SHAPES.square },
  "treffs-cafes": { short: "Treffs", shape: SHAPES.flower },
  bewegung: { short: "Bewegung", shape: SHAPES.triangle },
  wasser: { short: "Wasser", shape: SHAPES.drop },
  musik: { short: "Musik", shape: SHAPES.star },
  kreativ: { short: "Kreativ", shape: SHAPES.hexagon },
  buecher: { short: "Bücher", shape: SHAPES.diamond },
  museum: { short: "Museum", shape: SHAPES.arch },
  buehne: { short: "Bühne", shape: SHAPES.sparkle },
  natur: { short: "Natur", shape: SHAPES.leaf },
  beratung: { short: "Beratung", shape: SHAPES.plus },
};

/** Leitkategorie eines Angebots (erste in der festen Reihenfolge) – bestimmt Farbe und Form. */
export function primaryCategory(topics: readonly Topic[]): Category {
  return categoriesOf(topics)[0] ?? "treffs-cafes";
}
