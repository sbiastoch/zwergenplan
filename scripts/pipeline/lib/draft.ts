/**
 * Sammelkalender-Kandidat → RawEvent-ENTWURF (Plan 0002, E7). Abgeleitet wird nur, was sich
 * deterministisch ableiten lässt; offene Pflichtfelder (immer `summary`) füllt der Orchestrator,
 * `validate-raw` listet sie. Nie raten.
 */
import type { Anbieter, Provider, Registration } from "../../../src/domain/schema.ts";
import { addDays } from "../../../src/domain/time.ts";
import { categoriesOf, type Topic } from "../../../src/domain/topics.ts";
import type { Candidate, Occurrence } from "./candidate.ts";
import { FREE_RE, OPEN_RE, topicsFromText } from "./relevance.ts";

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

/** Ohne Rückfall aus dem Katalog (Plan 0030): Was der Kandidat nicht hergibt, bleibt offen. */
export function draftFromCandidate(c: Candidate, target: { providerId: string; venueId: string }): Draft | undefined {
  if (c.cancelled) return undefined;
  const text = [c.title, c.subtitle, c.description].filter(Boolean).join(" ");
  const regular = c.weekly || looksRegular(c.occurrences);
  const free =
    FREE_RE.test(`${text} ${c.cost ?? ""}`) || ["0", "kostenlos"].includes((c.cost ?? "").trim().toLowerCase());
  const cost = free ? "kostenlos" : undefined;
  const registration = registrationOf(c);
  const status = c.soldOut
    ? "ausgebucht"
    : c.waitlist
      ? "warteliste"
      : registration === "ohne-anmeldung"
        ? "ohne-anmeldung"
        : "unbekannt";
  const topics: Topic[] = topicsFromText(text);

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
  const open = [
    "summary",
    ...(categoriesOf(topics).length > 0 ? [] : ["topics"]),
    // ohne Rhythmus nur vermutet: Eine Reihe als Einzeltermine bekäme eine andere ID (ADR 0024)
    ...(regular ? [] : ["format"]),
    ...(registration ? [] : ["registration"]),
    ...(cost ? [] : ["cost"]),
  ];
  return { event, open };
}

/**
 * Katalogeintrag für einen Veranstalter, der bisher fehlt (`candidates add-provider`). Name, URL und Ort stammen
 * aus EINEM Termin – `notes` sagt woher, der Orchestrator prüft sie. Der Hauptort trägt die Anbieter-ID.
 */
export function providerFromCandidate(
  c: Candidate,
  input: {
    id: string;
    geo: { lat: number; lon: number; district?: string | undefined };
    catalog: readonly Provider[];
    today: string;
  },
): Anbieter {
  const { id, geo } = input;
  const aggregator = input.catalog.find((p) => p.role === "aggregator" && p.adapter === c.source);
  const district = geo.district;
  return {
    id,
    role: "anbieter",
    // die Region des Sammelkalenders, aus dem der Veranstalter kommt (Plan 0031, E1)
    region: aggregator?.region ?? "nuernberg",
    name: c.organizer ?? c.location ?? c.title,
    url: c.organizerUrl ?? c.detailUrl,
    programme: [
      { url: c.organizerUrl ?? c.detailUrl, kind: "html", use: "termine" },
      // evangelische-termine ordnet über die vid zu; `validateDataset` verlangt sie bei coveredBy (Plan 0031)
      ...(c.source === "evtermine" && c.organizerId
        ? [
            {
              url: `https://www.evangelische-termine.de/ical?vid=${c.organizerId}`,
              kind: "ical" as const,
              use: "termine" as const,
            },
          ]
        : []),
    ],
    availability: { shown: "nein" },
    verified: input.today,
    notes: [`Aus ${c.source} aufgenommen (${c.detailUrl}).`],
    venues: [
      {
        id,
        name: c.location ?? c.organizer ?? id,
        address: c.address ?? `${geo.lat},${geo.lon}`,
        ...(district ? { district } : {}),
        geo: { lat: geo.lat, lon: geo.lon },
      },
    ],
    ...(aggregator ? { coveredBy: aggregator.id } : {}),
  };
}
