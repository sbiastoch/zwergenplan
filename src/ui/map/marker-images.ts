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

/** Kachel eines Anbieter-Orts (Plan 0055, E4): 30 px wie der Kreis der Angebote, dazu 2 px Versatz-Schatten */
const TILE_PX = 30;
const SHADOW_PX = 2;
const RADIUS_PX = 8;
/** Laden mit Markise, wie das Tab-Symbol „Anbieter“ (icons.tsx, `store`), im 24er-Raster */
const STORE_PATH =
  "M3.5 8 5 4h14l1.5 4M3.5 8a2.1 2.1 0 0 0 4.25 0 2.1 2.1 0 0 0 4.25 0 2.1 2.1 0 0 0 4.25 0 2.1 2.1 0 0 0 4.25 0M5 10.5V20h14v-9.5M10 20v-5h4v5";

/** abgerundetes Quadrat per `arcTo` (ohne `roundRect`, das ältere Safari nicht kennen) */
function tilePath(ctx: CanvasRenderingContext2D, at: number) {
  const end = at + TILE_PX;
  ctx.beginPath();
  ctx.moveTo(at + RADIUS_PX, at);
  ctx.arcTo(end, at, end, end, RADIUS_PX);
  ctx.arcTo(end, end, at, end, RADIUS_PX);
  ctx.arcTo(at, end, at, at, RADIUS_PX);
  ctx.arcTo(at, at, end, at, RADIUS_PX);
  ctx.closePath();
}

/**
 * Bilder `anbieter` und `anbieter-blass` (Plan 0055, E4): abgerundete Kachel in `surface` mit Rand und Laden-Symbol in
 * `line`. Aktiv mit hartem Schatten (`shadow`), blass gestrichelt und ohne Schatten; die Deckkraft setzt der Layer.
 * Hell und dunkel über die Tokens des Themas, nach jedem `style.load` neu.
 */
export function addProviderImages(map: MapLibre, colors: { surface: string; line: string; shadow: string }): void {
  const ratio = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const size = (TILE_PX + SHADOW_PX + 2) * ratio;
  for (const pale of [false, true]) {
    const id = pale ? "anbieter-blass" : "anbieter";
    if (map.hasImage(id)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    if (!pale) {
      tilePath(ctx, 1 + SHADOW_PX);
      ctx.fillStyle = colors.shadow;
      ctx.fill();
    }
    tilePath(ctx, 1);
    ctx.fillStyle = colors.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.line;
    ctx.setLineDash(pale ? [4, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    // Symbol 18 px mittig in der Kachel
    ctx.translate(1 + (TILE_PX - 18) / 2, 1 + (TILE_PX - 18) / 2);
    ctx.scale(18 / 24, 18 / 24);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(STORE_PATH));
    map.addImage(id, ctx.getImageData(0, 0, size, size), { pixelRatio: ratio });
  }
}
