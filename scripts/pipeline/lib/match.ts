/**
 * Ordnet einen Sammelkalender-Kandidaten einem Katalog-Anbieter und einem seiner Orte zu (Plan 0002, E7).
 * Nur Orte von Anbietern (role: anbieter) – Aggregatoren und Verzeichnisse haben keine Angebote.
 * Liefert einen VORSCHLAG; der Orchestrator bestätigt oder überschreibt ihn bei `candidates keep`.
 */
import type { Anbieter, Provider, Venue } from "../../../src/domain/schema.ts";
import type { Candidate } from "./candidate.ts";
import { ratio } from "./similar.ts";

export type Match =
  | { kind: "ok"; providerId: string; venueId: string; via: string }
  | { kind: "offen"; reason: string; providerId?: string };

const GEO_METERS = 75;

function meters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return Math.hypot((a.lat - b.lat) * 110_540, (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
}

/** „Frankenstr. 29, 90443 Nürnberg“ → „frankenstrasse29|90443“ (Straße + Nr. + PLZ). */
export function addressKey(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const clean = address
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/ß/g, "ss")
    .replace(/str\.|strasse/g, "strasse")
    .replace(/südl\./g, "suedliche");
  const zip = /\b(9\d{4})\b/.exec(clean)?.[1];
  const street = /([a-zäöü][a-zäöü.\- ]*?)\s*(\d+\s*[a-z]?)\b(?!\d)/.exec(clean.replace(/\b9\d{4}\b.*/, ""));
  if (!zip || !street?.[1] || !street[2]) return undefined;
  const name =
    street[1]
      .split(",")
      .at(-1)
      ?.replace(/[^a-zäöü]/g, "") ?? "";
  return `${name.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")}${street[2].replace(/\s/g, "")}|${zip}`;
}

/** Veranstalter-IDs von evangelische-termine.de in den Programm-URLs eines Anbieters. */
export const vidOf = (p: Provider): string[] =>
  p.programme.flatMap((g) => /evangelische-termine\.de\/\S*[?&]vid=(\d+)/.exec(g.url)?.[1] ?? []);

function nameScore(c: Candidate, p: Provider): number {
  const a = (c.organizer ?? c.location ?? "").toLowerCase();
  return a ? ratio(a, p.name.toLowerCase()) : 0;
}

function venueOf(c: Candidate, p: Anbieter): Venue | undefined {
  const geo = c.geo;
  if (geo) {
    const near = p.venues
      .map((v) => ({ v, d: meters(v.geo, geo) }))
      .filter((x) => x.d <= GEO_METERS)
      .sort((a, b) => a.d - b.d)[0];
    if (near) return near.v;
  }
  const key = addressKey(c.address);
  const byAddress = key ? p.venues.find((v) => addressKey(v.address) === key) : undefined;
  if (byAddress) return byAddress;
  return p.venues.length === 1 ? p.venues[0] : undefined;
}

export function matchCandidate(c: Candidate, catalog: readonly Provider[]): Match {
  const anbieter = catalog.filter((p): p is Anbieter => p.role === "anbieter");

  // 1. evangelische-termine: Veranstalter-ID = vid in einer Programm-URL
  if (c.source === "evtermine" && c.organizerId) {
    const byVid = anbieter.filter((p) => vidOf(p).includes(c.organizerId as string));
    for (const p of byVid) {
      const v = venueOf(c, p);
      if (v) return { kind: "ok", providerId: p.id, venueId: v.id, via: "vid" };
    }
    if (byVid.length > 0)
      return { kind: "offen", reason: "Anbieter per vid erkannt, Ort unbekannt", providerId: byVid[0]?.id ?? "" };
  }

  // 2. Koordinaten in der Nähe eines Orts
  const candidates: Array<{ p: Anbieter; v: Venue; via: string }> = [];
  if (c.geo) {
    const geo = c.geo;
    for (const p of anbieter)
      for (const v of p.venues) if (meters(v.geo, geo) <= GEO_METERS) candidates.push({ p, v, via: "geo" });
  }
  // 3. gleiche Adresse
  const key = addressKey(c.address);
  if (candidates.length === 0 && key) {
    for (const p of anbieter)
      for (const v of p.venues) if (addressKey(v.address) === key) candidates.push({ p, v, via: "adresse" });
  }
  candidates.sort((a, b) => (c.geo ? meters(a.v.geo, c.geo) - meters(b.v.geo, c.geo) : 0));
  const providers = [...new Set(candidates.map((x) => x.p))];
  if (providers.length === 1 && candidates[0]) {
    const { p, v, via } = candidates[0];
    return { kind: "ok", providerId: p.id, venueId: v.id, via };
  }
  if (providers.length > 1) {
    // geteilter Ort: der Veranstaltername entscheidet
    const ranked = candidates
      .map((x) => ({ ...x, score: nameScore(c, x.p) }))
      .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
    const [best, second] = ranked;
    if (best && best.score >= 0.5 && (second === undefined || best.score - second.score >= 0.1)) {
      return { kind: "ok", providerId: best.p.id, venueId: best.v.id, via: `${best.via}+name` };
    }
    return { kind: "offen", reason: `Ort geteilt von ${providers.map((p) => p.id).join(", ")}` };
  }

  // 4. Anbieter am Namen erkannt, Ort nicht
  const byName = anbieter
    .map((p) => ({ p, score: nameScore(c, p) }))
    .filter((x) => x.score >= 0.75)
    .sort((a, b) => b.score - a.score)[0];
  if (byName) {
    const v = venueOf(c, byName.p);
    if (v) return { kind: "ok", providerId: byName.p.id, venueId: v.id, via: "name" };
    return { kind: "offen", reason: "Anbieter am Namen erkannt, Ort unbekannt", providerId: byName.p.id };
  }
  return { kind: "offen", reason: "Veranstalter nicht im Katalog" };
}
