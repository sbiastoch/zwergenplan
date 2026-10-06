/**
 * Route in Google Maps (Plan 0019, E1–E3, E7): Link mit der Adresse des Orts als Ziel, im Modus Bus & Bahn. Ohne
 * `origin`: Maps nimmt den Standort des Geräts, der Startpunkt des Zwergenplans verlässt das Gerät nie. Nicht zu
 * verwechseln mit `route.ts` (URL-Route der App).
 */
// Laufzeit-Import aus site-data.ts: Das Modul importiert kein Zod, der Rest fällt per Tree-Shaking weg (E2, Review N6).
import { MIN_ADDRESS } from "./site-data.ts";

const MAPS_DIR = "https://www.google.com/maps/dir/";
/** Teil mit PLZ und Ort: „90402 Nürnberg“ */
const POSTCODE_PART = /^\d{5}\s+\S/;
/** Teil, der auf eine Hausnummer endet: „Musterweg 7“, „7a“, „7 b“, „12-14“ – nicht „Gebäude E6“, nicht „2. OG“ */
const STREET_PART = /\s\d+\s?[a-z]?(\s?[-–/]\s?\d+[a-z]?)?$/i;

/** Klammerzusätze weg, Leerzeichen zusammengezogen, kein Leerzeichen vor einem Komma */
function withoutNotes(address: string): string {
  return address
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

/**
 * Ziel für Maps (E2): „Straße Hausnummer, PLZ Ort“, sonst die Adresse ohne Klammerzusätze. Präfixe wie
 * „Pfarramt …“ und Zusätze wie „2. OG“ fallen weg, damit Maps nicht nach einem Namen sucht. Bliebe weniger als
 * `MIN_ADDRESS` übrig, gilt die Adresse unverändert.
 */
export function mapsDestination(address: string): string {
  const clean = withoutNotes(address);
  if (clean.length < MIN_ADDRESS) return address;
  const parts = clean.split(",").map((p) => p.trim());
  const postcode = parts.findIndex((p) => POSTCODE_PART.test(p));
  // der erste Teil mit Hausnummer: Zusätze wie „Halle 2“ stehen hinter der Straße (Review 2, N6)
  const street = parts.slice(0, Math.max(postcode, 0)).findIndex((p) => STREET_PART.test(p));
  return postcode > 0 && street >= 0 ? `${parts[street]}, ${parts[postcode]}` : clean;
}

/** `https://www.google.com/maps/dir/?api=1&destination=…&travelmode=transit` (E1) */
export function mapsDirectionsUrl(address: string): string {
  const query = new URLSearchParams({ api: "1", destination: mapsDestination(address), travelmode: "transit" });
  return `${MAPS_DIR}?${query.toString()}`;
}
