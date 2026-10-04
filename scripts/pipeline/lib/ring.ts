/**
 * Lage zum Nürnberger Altstadtring (Stadtmauer), aus ring.py.
 * „knapp-aussen“ = höchstens 700 m außerhalb der Mauer.
 */
import type { Venue } from "../../../src/domain/schema.ts";

type Ring = Venue["ring"];

/** Stadtmauer im Uhrzeigersinn ab Spittlertor (lat, lon), grob entlang der Grabenstraßen. */
const WALL: ReadonlyArray<readonly [number, number]> = [
  [49.44775, 11.0681], // Spittlertor
  [49.4513, 11.067], // Westtorgraben
  [49.4547, 11.0696], // Hallertor
  [49.4575, 11.0718], // Neutor
  [49.459, 11.0755], // Tiergärtnertor / Burg
  [49.4593, 11.0773], // Vestnertor
  [49.4578, 11.0855], // Maxtor
  [49.4555, 11.0865], // Laufer Tor
  [49.4527, 11.0868], // Wöhrder Bastei
  [49.4492, 11.0843], // Marientor
  [49.4474, 11.0815], // Königstor
  [49.4466, 11.0778], // Frauentor
  [49.447, 11.0745], // Frauentorgraben West
  [49.4472, 11.0715], // Färbertor
  [49.447, 11.069], // Spittlertorgraben
];
const KNAPP_METER = 700;

const xy = (lat: number, lon: number): [number, number] => [
  lon * 111_320 * Math.cos((49.45 * Math.PI) / 180),
  lat * 110_540,
];
const WALL_XY = WALL.map(([lat, lon]) => xy(lat, lon));
const EDGES = WALL_XY.map((p, i) => [p, WALL_XY[(i + 1) % WALL_XY.length] ?? p] as const);

function inside(x: number, y: number): boolean {
  let result = false;
  for (const [[x1, y1], [x2, y2]] of EDGES) {
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) result = !result;
  }
  return result;
}

function distanceToWall(x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const [[x1, y1], [x2, y2]] of EDGES) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return best;
}

/** Ring und Abstand zur Mauer in Metern. Ein Nominatim-Stadtteil „Altstadt, St. …“ gilt als innen. */
export function classifyRing(lat: number, lon: number, district?: string): { ring: Ring; meters: number } {
  const [x, y] = xy(lat, lon);
  if (inside(x, y) || (district ?? "").startsWith("Altstadt, St.")) return { ring: "innen", meters: 0 };
  const meters = Math.round(distanceToWall(x, y));
  return { ring: meters <= KNAPP_METER ? "knapp-aussen" : "aussen", meters };
}
