/**
 * Kategorie-Symbole der Marker (Plan 0024, E6): die Formen aus `CATEGORY_UI` (wie `Shape` in der Liste),
 * lokal per Canvas gezeichnet und als Bild `kategorie-<kategorie>` registriert. Kein Request, keine Sprites.
 * Nach jedem `style.load` neu, denn ein Stilwechsel verwirft die Bilder.
 */
import type { Map as MapLibre } from "maplibre-gl";
import { CATEGORIES, type Category } from "../../domain/topics.ts";
import { CATEGORY_UI } from "../categories.ts";

/** Kantenlänge des Symbols in CSS-Pixeln; der Kreis darum hat 30 px (layers.ts) */
const SYMBOL_PX = 16;

const imageId = (category: Category) => `kategorie-${category}`;

/**
 * Registriert für jede Kategorie ein Bild in `color`, gestochen scharf über `devicePixelRatio`.
 * Ohne Canvas-Kontext (sehr alte Browser) fehlen nur die Symbole; die Kreise in Kategorie-Farbe bleiben.
 */
export function addCategoryImages(map: MapLibre, color: string): void {
  const ratio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const size = SYMBOL_PX * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  // Pfade im 24er-Raster (categories.ts)
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  for (const category of CATEGORIES) {
    const id = imageId(category);
    if (map.hasImage(id)) continue;
    ctx.clearRect(0, 0, 24, 24);
    ctx.fill(new Path2D(CATEGORY_UI[category].shape));
    map.addImage(id, ctx.getImageData(0, 0, size, size), { pixelRatio: ratio });
  }
}
