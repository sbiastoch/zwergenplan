/**
 * Sammelkalender-Kandidat → RawEvent-ENTWURF (Plan 0002, E7). Abgeleitet wird nur, was sich
 * deterministisch ableiten lässt; offene Pflichtfelder (immer `summary`) füllt der Orchestrator,
 * `validate-raw` listet sie. Nie raten.
 */
import type { Provider, Registration } from "../../../src/domain/schema.ts";
import { addDays } from "../../../src/domain/time.ts";
import { categoriesOf, type Topic } from "../../../src/domain/topics.ts";
import type { Candidate, Occurrence } from "./candidate.ts";
import { FREE_RE, OPEN_RE, topicsFromText } from "./relevance.ts";
import { classifyRing } from "./ring.ts";

export interface Draft {
  event: Record<string, unknown>;
  /** Pflichtfelder, die der Orchestrator noch füllen muss */
  open: string[];
}

/** Reihe: mindestens zwei Termine im Abstand von 7 oder 14 Tagen zur gleichen Uhrzeit. */
export function looksRegular(occurrences: readonly Occurrence[]): boolean {
  const starts = new Set(occurrences.map((o) => o.start));
  return occurrences.some((o) =>
    [7, 14].some((days) => starts.has(`${addDays(o.start.slice(0, 10), days)}${o.start.slice(10)}`)),
  );
}

/** Anmeldung laut Text bzw. Quelle; undefined, wenn nichts dazu bekannt ist. */
export function registrationOf(c: Candidate): Registration | undefined {
  const text = [c.title, c.subtitle, c.description].filter(Boolean).join(" ");
  if (OPEN_RE.test(text)) return "ohne-anmeldung";
  if (c.registrationRequired || /anmeld/i.test(text)) return "mit-anmeldung";
  return undefined;
}

function only<T>(values: readonly T[]): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

export function draftFromCandidate(
  c: Candidate,
  target: { providerId: string; venueId: string },
  provider: Provider,
): Draft | undefined {
  if (c.cancelled) return undefined;
  const text = [c.title, c.subtitle, c.description].filter(Boolean).join(" ");
  const regular =
    c.weekly ||
    looksRegular(c.occurrences) ||
    (provider.formats.length === 1 && provider.formats[0] === "regelmaessig");
  const free =
    FREE_RE.test(`${text} ${c.cost ?? ""}`) || ["0", "kostenlos"].includes((c.cost ?? "").trim().toLowerCase());
  const cost = free ? "kostenlos" : only(provider.costs);
  const registration = registrationOf(c) ?? only(provider.registrations);
  const status = c.soldOut
    ? "ausgebucht"
    : c.waitlist
      ? "warteliste"
      : registration === "ohne-anmeldung"
        ? "ohne-anmeldung"
        : "unbekannt";
  let topics: Topic[] = topicsFromText(text);
  if (categoriesOf(topics).length === 0) topics = [...new Set([...topics, ...provider.topics])];

  const event: Record<string, unknown> = {
    providerId: target.providerId,
    venueId: target.venueId,
    title: c.title.slice(0, 140),
    summary: "",
    topics,
    format: regular ? "regelmaessig" : "einmalig",
    ...(registration ? { registration } : {}),
    ...(cost ? { cost } : {}),
    ...(!free && c.cost ? { price: c.cost } : {}),
    url: c.ticketUrl ?? c.detailUrl,
    sourceUrl: c.detailUrl,
    availability: {
      status,
      ...(status === "unbekannt" ? { note: `Plätze/Anmeldung: siehe ${c.ticketUrl ?? c.detailUrl}` } : {}),
    },
    schedule: { kind: "dates", dates: c.occurrences },
    via: c.source,
  };
  const open = ["summary", ...(registration ? [] : ["registration"]), ...(cost ? [] : ["cost"])];
  return { event, open };
}

/**
 * Katalogeintrag für einen Veranstalter, der bisher fehlt (`candidates add-provider`). Die Werte stammen
 * aus EINEM Termin – `notes` sagt das, der Orchestrator prüft sie. Der Hauptort trägt die Anbieter-ID.
 */
export function providerFromCandidate(
  c: Candidate,
  input: {
    id: string;
    geo: { lat: number; lon: number; district?: string | undefined };
    catalog: readonly Provider[];
    today: string;
  },
): Provider {
  const { id, geo } = input;
  let topics: Topic[] = topicsFromText(`${c.title} ${c.description}`);
  if (categoriesOf(topics).length === 0) topics = [...topics, "eltern-kind-gruppe"];
  const free = FREE_RE.test(`${c.title} ${c.description} ${c.cost ?? ""}`);
  const aggregator = input.catalog.find((p) => p.role === "aggregator" && p.adapter === c.source);
  const district = geo.district;
  return {
    id,
    role: "anbieter",
    name: c.organizer ?? c.location ?? c.title,
    url: c.organizerUrl ?? c.detailUrl,
    topics,
    formats: [c.weekly || looksRegular(c.occurrences) ? "regelmaessig" : "einmalig"],
    costs: [free ? "kostenlos" : "kostenpflichtig"],
    registrations: [registrationOf(c) ?? "mit-anmeldung"],
    programme: [{ url: c.organizerUrl ?? c.detailUrl, kind: "html" }],
    availability: { shown: "nein" },
    verified: input.today,
    notes: `Aus ${c.source} aufgenommen (${c.detailUrl}). Kosten/Anmeldung/Format aus einem Termin abgeleitet – prüfen.`,
    venues: [
      {
        id,
        name: c.location ?? c.organizer ?? id,
        address: c.address ?? `${geo.lat},${geo.lon}`,
        ...(district ? { district } : {}),
        ring: classifyRing(geo.lat, geo.lon, district).ring,
        geo: { lat: geo.lat, lon: geo.lon },
      },
    ],
    ...(aggregator ? { coveredBy: aggregator.id } : {}),
  };
}
