/**
 * Adressen aus Modellantworten vereinheitlichen (Plan 0050, E5), vor Geocoder und Cache-Schlüssel. Rein.
 *
 * Entfernt Klammern, vereinheitlicht „Str.“ zu „Straße“, ergänzt das Leerzeichen vor der Hausnummer und zerlegt in
 * Name (Teile vor der Straße), Straße, PLZ und Ort. Text nach dem Ort (Etage, Hinterhaus) fällt weg.
 */
export interface Address {
  /** „Straße Nr, PLZ Ort“, ohne Straße „Name, Ort“ */
  text: string;
  street?: string;
  postcode?: string;
  city?: string;
  /** Teile vor der Straße, etwa Gemeindehaus oder Bad */
  name?: string;
  /** Straßenname ohne Hausnummer im Namen („Turnhalle Volksschule Fürreuthweg“), nur ohne `street` */
  streetName?: string;
}

const STREET = /[A-Za-zÄÖÜäöüß.]\s\d+\s*[a-zA-Z]?(\s*[-–/]\s*\d+\s*[a-zA-Z]?)?$/;
const STREET_NAME = /(?:^|\s)(\p{Lu}[\p{L}-]*(?:straße|weg|gasse|platz|ring|allee|damm|ufer|steig|pfad|anger))$/u;
const POSTCODE_CITY = /^(\d{5})\s+(.+)$/;

function cleanPart(part: string): string {
  return part
    .replace(/(s)tr(?:\.|aße|asse)?\s*(?=\d)/gi, (_, s: string) => `${s}traße `)
    .replace(/\b(S)tr\.(?=\s|$)/g, "$1traße")
    .replace(/(s)tr\.(?=\s|$)/g, "$1traße")
    .replace(/([A-Za-zÄÖÜäöüß])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAddress(raw: string): Address {
  const parts = raw
    .replace(/\([^)]*\)/g, " ")
    .split(",")
    .map(cleanPart)
    .filter(Boolean);
  const s = parts.findIndex((p) => STREET.test(p) && !POSTCODE_CITY.test(p));
  const street = parts[s];
  const out: Address = { text: "" };
  if (street !== undefined) out.street = street;
  const pc = parts
    .slice(s + 1)
    .map((p) => POSTCODE_CITY.exec(p))
    .find((m) => m !== null);
  if (pc?.[1] !== undefined && pc[2] !== undefined) {
    out.postcode = pc[1];
    out.city = pc[2];
  } else {
    // ohne PLZ: der letzte Teil ohne Ziffern nach der Straße (bzw. nach dem Namen) ist der Ort
    const city = parts.findLast((p, i) => i > Math.max(s, 0) && !/\d/.test(p));
    if (city) out.city = city;
  }
  const cityAt = parts.findIndex((p) => POSTCODE_CITY.test(p) || p === out.city);
  const nameParts = parts.slice(0, s >= 0 ? s : cityAt >= 0 ? cityAt : parts.length);
  if (nameParts.length > 0) out.name = nameParts.join(", ");
  const streetName = out.street ? undefined : nameParts.map((p) => STREET_NAME.exec(p)?.[1]).findLast(Boolean);
  if (streetName) out.streetName = streetName;
  const place = out.city ? [out.postcode, out.city].filter(Boolean).join(" ") : undefined;
  out.text = [out.street ?? out.name, place].filter(Boolean).join(", ");
  return out;
}

/** Schlüssel einer Geocoder-Eingabe in `orte` und im Lauf-Cache (Plan 0050, E5): normalisierte Adresse und Ortsname */
export function placeKey(address: string, venueName?: string): string {
  const name = venueName?.replace(/\s+/g, " ").trim();
  return name ? `${normalizeAddress(address).text} | ${name}` : normalizeAddress(address).text;
}
