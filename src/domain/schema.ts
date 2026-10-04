/**
 * Einzige Quelle der Wahrheit für alle Daten (ADR 0001, 0003).
 * JSON Schema unter schema/ wird hieraus exportiert – nie von Hand ändern.
 */
import { z } from "zod";
import { categoriesOf, TOPICS } from "./topics.ts";

const kebab = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case erwartet");
/** Zeitpunkt mit Offset, z. B. 2026-10-25T10:00:00+01:00 (Zeitumstellung eindeutig). */
const Instant = z.iso.datetime({ offset: true, local: false });
const IsoDate = z.iso.date();

const Topic = z.enum(TOPICS);
export const Format = z.enum(["kurs", "regelmaessig", "einmalig"]);
export const Registration = z.enum(["mit-anmeldung", "ohne-anmeldung"]);
export const Cost = z.enum(["kostenlos", "kostenpflichtig"]);
const AvailabilityStatus = z.enum(["frei", "wenige", "ausgebucht", "warteliste", "ohne-anmeldung", "unbekannt"]);

/** Großraum Nürnberg/Fürth/Erlangen – alles außerhalb ist ein Geocoding-Fehler. */
const NUERNBERG_BBOX = { minLat: 49.3, maxLat: 49.65, minLon: 10.85, maxLon: 11.3 } as const;

const Geo = z.object({
  lat: z.number().min(NUERNBERG_BBOX.minLat).max(NUERNBERG_BBOX.maxLat),
  lon: z.number().min(NUERNBERG_BBOX.minLon).max(NUERNBERG_BBOX.maxLon),
});

export const Venue = z.strictObject({
  id: kebab,
  name: z.string().min(1),
  address: z.string().min(5),
  district: z.string().optional(),
  ring: z.enum(["innen", "knapp-aussen", "aussen"]),
  geo: Geo,
  /** Stufe 2 (ADR 0005): nächste Haltestellen für die Öffi-Fahrzeitmatrix. */
  nearestStops: z
    .array(z.strictObject({ stopId: z.string(), name: z.string(), walkMeters: z.number().nonnegative() }))
    .optional(),
});

export const Provider = z.strictObject({
  id: kebab,
  name: z.string().min(1),
  url: z.url(),
  venues: z.array(Venue).min(1),
  topics: z.array(Topic).min(1),
  programme: z
    .array(
      z.strictObject({
        url: z.url(),
        kind: z.enum(["html", "pdf", "ical", "json-api", "js"]),
        note: z.string().optional(),
      }),
    )
    .min(1),
  availability: z.strictObject({
    shown: z.enum(["ja", "teilweise", "nein", "unbekannt"]),
    how: z.string().optional(),
    system: z.string().optional(),
  }),
  verified: IsoDate,
  notes: z.string().optional(),
});

export const Session = z
  .strictObject({ start: Instant, end: Instant })
  .refine((s) => Date.parse(s.end) > Date.parse(s.start), "end muss nach start liegen");

export const AgeRange = z
  .strictObject({
    /** inklusiv, vollendete Lebensmonate */
    minMonths: z.int().min(0).max(36),
    /** inklusiv */
    maxMonths: z.int().min(0).max(36),
  })
  .refine((a) => a.minMonths <= a.maxMonths, "minMonths <= maxMonths");

export const Offer = z
  .strictObject({
    /** deterministisch: `${providerId}--${slug(title)}--${venueId}` (ADR 0003) */
    id: z.string().regex(/^[a-z0-9-]+--[a-z0-9-]+--[a-z0-9-]+$/),
    providerId: kebab,
    venueId: kebab,
    title: z.string().min(1).max(140),
    /** eigene Zusammenfassung, nie 1:1 kopierter Anbietertext */
    summary: z.string().min(1).max(320),
    topics: z.array(Topic).min(1),
    format: Format,
    registration: Registration,
    cost: Cost,
    price: z.string().optional(),
    age: AgeRange.optional(),
    sessions: z.array(Session).min(1),
    registrationWindow: z.strictObject({ opens: Instant.optional(), deadline: Instant.optional() }).optional(),
    availability: z.strictObject({
      status: AvailabilityStatus,
      note: z.string().optional(),
      checkedAt: Instant,
    }),
    url: z.url(),
    sourceUrl: z.url(),
  })
  .refine((o) => o.id.startsWith(`${o.providerId}--`) && o.id.endsWith(`--${o.venueId}`), {
    message: "id muss mit providerId-- beginnen und mit --venueId enden",
    path: ["id"],
  })
  .refine((o) => categoriesOf(o.topics).length > 0, {
    message: "mindestens ein Thema muss einer Kategorie zugeordnet sein",
    path: ["topics"],
  })
  .refine((o) => o.format !== "einmalig" || o.sessions.length === 1, {
    message: "einmalig hat genau einen Termin",
    path: ["sessions"],
  })
  .refine(
    (o) => o.sessions.every((s, i, all) => i === 0 || Date.parse(all[i - 1]?.start ?? "") < Date.parse(s.start)),
    { message: "sessions aufsteigend und ohne Dubletten", path: ["sessions"] },
  );

export const OffersFile = z.strictObject({
  generatedAt: Instant,
  horizon: z.strictObject({ from: IsoDate, to: IsoDate }),
  offers: z.array(Offer),
});

export const ProvidersFile = z.array(Provider);

export type Venue = z.infer<typeof Venue>;
export type Provider = z.infer<typeof Provider>;
export type Session = z.infer<typeof Session>;
export type AgeRange = z.infer<typeof AgeRange>;
export type Offer = z.infer<typeof Offer>;
export type OffersFile = z.infer<typeof OffersFile>;
export type Format = z.infer<typeof Format>;
export type Registration = z.infer<typeof Registration>;
export type Cost = z.infer<typeof Cost>;
