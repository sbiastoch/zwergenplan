/**
 * Darstellung der 12 Kategorien: Kurzlabel für die Sticker-Leiste und eine eigene Form (SVG-Pfad,
 * 24er-Raster) – überall gleich. Die Farbe kommt aus CSS (`.k-<kategorie>`, styles.css). Die Formen liegen in
 * src/domain/category-look.ts, damit auch das Kachelbild der Vorschau sie zeichnet (Plan 0026, Nachtrag A).
 */
import { CATEGORY_SHAPES as S } from "../domain/category-look.ts";
import type { Category } from "../domain/topics.ts";

export const CATEGORY_UI: Record<Category, { short: string; shape: string }> = {
  babykurse: { short: "Babykurse", shape: S.babykurse },
  "krabbel-spielgruppen": { short: "Krabbeln", shape: S["krabbel-spielgruppen"] },
  "treffs-cafes": { short: "Treffs", shape: S["treffs-cafes"] },
  bewegung: { short: "Bewegung", shape: S.bewegung },
  wasser: { short: "Wasser", shape: S.wasser },
  musik: { short: "Musik", shape: S.musik },
  kreativ: { short: "Kreativ", shape: S.kreativ },
  buecher: { short: "Bücher", shape: S.buecher },
  museum: { short: "Museum", shape: S.museum },
  buehne: { short: "Bühne", shape: S.buehne },
  natur: { short: "Natur", shape: S.natur },
  beratung: { short: "Beratung", shape: S.beratung },
};
