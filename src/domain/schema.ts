/**
 * Einzige Quelle der Wahrheit für alle Daten (ADR 0001, 0003).
 * JSON Schema unter schema/ wird hieraus exportiert – nie von Hand ändern.
 */
import { z } from "zod";
import { inBounds } from "./geo.ts";
import { KEBAB_ID_PATTERN, MAX_KEBAB_ID, MAX_OFFER_ID, OFFER_ID_PATTERN } from "./ids.ts";
import { REGION_IDS, REGIONS } from "./regions.ts";
import { isoWeekday } from "./time.ts";
import { categoriesOf, TOPICS } from "./topics.ts";

const kebab = z.string().max(MAX_KEBAB_ID).regex(KEBAB_ID_PATTERN, "kebab-case erwartet");
/** Zeitpunkt mit Offset, z. B. 2026-10-25T10:00:00+01:00 (Zeitumstellung eindeutig). */
const Instant = z.iso.datetime({ offset: true, local: false });
const IsoDate = z.iso.date();

const Topic = z.enum(TOPICS);
export const Format = z.enum(["kurs", "regelmaessig", "einmalig"]);
export const Registration = z.enum(["mit-anmeldung", "ohne-anmeldung"]);
export const Cost = z.enum(["kostenlos", "kostenpflichtig"]);
const AvailabilityStatus = z.enum(["frei", "wenige", "ausgebucht", "warteliste", "ohne-anmeldung", "unbekannt"]);

/** Koordinate; ob sie in der Region des Anbieters liegt, prüft `Provider` (Plan 0031, E1). */
const Geo = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

/** Heuristik (Plan 0031, Test 2): „08.11.“ oder ISO-Datum; „8. November“ rutscht durch. */
const DATE_LIKE = /\d{1,2}\.\d{1,2}\.|\d{4}-\d{2}-\d{2}/;
/** Kurzer Extraktionshinweis für das Modell, ohne Datum (das veraltet; Plan 0031, E3) */
const Hint = z
  .string()
  .min(1)
  .max(200)
  .refine((h) => !DATE_LIKE.test(h), "hint ohne Datum");

export const Venue = z.strictObject({
  id: kebab,
  name: z.string().min(1),
  address: z.string().min(5),
  district: z.string().optional(),
  // `ring` (Abstand zur Nürnberger Stadtmauer) entfällt: Nürnberg-Semantik, die niemand las (Plan 0031, E2).
  geo: Geo,
  /** Extraktionshinweis zu diesem Ort für den Crawler („Babymassage freitags“), ohne Datum (Plan 0031, Review 2 M6) */
  hint: Hint.optional(),
  // `nearestStops` (ADR 0005) entfällt: nächste Halte sind ein abgeleiteter Wert (ADR 0011, Plan 0009 E12).
});

/** Alter, das ein Anbieter insgesamt bedient (inklusiv, vollendete Monate) – auch über 3 Jahre hinaus. */
export const ProviderAge = z
  .strictObject({ minMonths: z.int().min(0).max(216), maxMonths: z.int().min(0).max(216) })
  .refine((a) => a.minMonths <= a.maxMonths, "minMonths <= maxMonths");

/**
 * Nur `{von}` und `{bis}` (YYYY-MM-DD, Abfragefenster) ersetzt der Abruf (Plan 0031, E3; Plan 0015, E4). Als Platzhalter
 * gilt `{name}` aus Buchstaben und `_`; JSON- und GraphQL-Klammern mit Anführungszeichen oder Leerzeichen sind keine.
 */
const onlyKnownPlaceholders = (text: string) =>
  [...text.matchAll(/\{([A-Za-z_]+)\}/g)].every(([, name]) => name === "von" || name === "bis");
const PLACEHOLDER_MESSAGE = "nur die Platzhalter {von} und {bis}";
/** JSON-Body, nachdem `{von}`/`{bis}` durch ein Datum ersetzt sind (Plan 0031, Review 2 B1) */
const isJsonWithPlaceholders = (body: string) => {
  try {
    JSON.parse(body.replaceAll("{von}", "2026-01-01").replaceAll("{bis}", "2027-02-01"));
    return true;
  } catch {
    return false;
  }
};

/**
 * Eine Stelle, an der Termine (oder Plätze) stehen, so beschrieben, dass ein Crawler sie abrufen kann (Plan 0031, E3).
 */
const Programme = z.strictObject({
  url: z.url().refine(onlyKnownPlaceholders, PLACEHOLDER_MESSAGE),
  /** Format der Antwort */
  kind: z.enum(["html", "pdf", "ical", "json-api"]),
  /** Seite braucht JavaScript; der Crawler rendert sie im Browser */
  render: z.literal("browser").optional(),
  /** Wozu die Seite dient: nur `termine` und `verfuegbarkeit` gehen in Abruf und Prompt */
  use: z.enum(["termine", "verfuegbarkeit", "info"]),
  request: z
    .strictObject({
      method: z.literal("POST"),
      headers: z.record(z.string(), z.string()).optional(),
      body: z
        .string()
        .min(1)
        .refine(onlyKnownPlaceholders, PLACEHOLDER_MESSAGE)
        .refine(isJsonWithPlaceholders, "body muss JSON sein (mit {von}/{bis} als Datum)"),
    })
    .optional(),
  /** mit Abrufbeleg gesperrt (Login, Bot-Schutz auch im Browser): Der Anbieter ist bewusst ohne diese Quelle */
  blocked: z.strictObject({ reason: z.string().min(1), since: IsoDate }).optional(),
  /** kurzer Extraktionshinweis für das Modell, ohne Datum (das veraltet) */
  hint: Hint.optional(),
});

/** Eine Notiz je Eintrag; „ | “ klebte früher mehrere zusammen (Plan 0030). */
const Note = z
  .string()
  .regex(/\S/, "Notiz ohne Text")
  .refine((n) => !n.includes(" | "), "eine Notiz je Eintrag, kein „ | “");

/**
 * Was jeder Katalog-Eintrag als QUELLE hat (Plan 0030, ADR 0024). Inhalte (Themen, Format, Kosten, Anmeldung)
 * stehen nur an den Angeboten.
 */
const sourceBase = {
  /** Region der Quelle (Plan 0031, E1); Orte müssen in ihrer bbox liegen */
  region: z.enum(REGION_IDS),
  name: z.string().min(1),
  url: z.url(),
  /** ALLE Stellen, an denen Termine stehen */
  programme: z.array(Programme).min(1),
  availability: z.strictObject({
    shown: z.enum(["ja", "teilweise", "nein", "unbekannt"]),
    how: z.string().regex(/\p{L}/u, "Text erwartet, kein Platzhalter").optional(),
    system: z.string().optional(),
  }),
  /** Datum der letzten Live-Prüfung */
  verified: IsoDate,
  notes: z.array(Note).min(1).optional(),
};

/** Sammelkalender mit eigenem Abfrage-Adapter in scripts/pipeline (Plan 0002). */
const AGGREGATOR_ADAPTERS = ["stadt-vk", "frankenkids", "evtermine"] as const;

/**
 * Katalog-Eintrag (data/providers.yaml). Die Rolle bestimmt, was Pflicht ist und was der Crawler abruft (ADR 0025):
 * - anbieter: veranstaltet selbst, hat mindestens einen Ort; nur Anbieter haben Angebote. Der Crawler ruft ihre
 *   `programme` ab, außer bei `coveredBy` oder `skipCrawl`.
 * - aggregator: Sammelkalender fremder Veranstalter; abgefragt nur über `adapter`, `programme` ist Doku
 * - verzeichnis: Liste zur Katalogpflege, liefert keine Termine und wird nie abgerufen
 */
export const Provider = z.discriminatedUnion("role", [
  z
    .strictObject({
      id: kebab,
      role: z.literal("anbieter"),
      ...sourceBase,
      age: ProviderAge.optional(),
      venues: z.array(Venue).min(1),
      /** Termine kommen vollständig über diesen Sammelkalender (eigene Seite wird nicht abgefragt) */
      coveredBy: kebab.optional(),
      /**
       * Bewusst nicht crawlen: Der Anbieter veröffentlicht keine Termine, bleibt aber in der Anbieterübersicht
       * (Nutzerentscheid, Plan 0031).
       */
      skipCrawl: z.strictObject({ reason: z.string().min(1), since: IsoDate }).optional(),
    })
    .superRefine((p, ctx) => {
      // ohne coveredBy und skipCrawl holt der Crawler die Termine selbst: eine abrufbare Terminseite (Plan 0031, E3)
      if (p.coveredBy !== undefined && p.skipCrawl !== undefined)
        ctx.addIssue({ code: "custom", message: "skipCrawl und coveredBy schließen sich aus", path: ["skipCrawl"] });
      const crawled = p.coveredBy === undefined && p.skipCrawl === undefined;
      if (crawled && !p.programme.some((g) => g.use === "termine" && g.blocked === undefined))
        ctx.addIssue({
          code: "custom",
          message: "braucht eine Terminseite (use: termine) ohne blocked, sonst skipCrawl mit Grund",
          path: ["programme"],
        });
      const { bbox } = REGIONS[p.region];
      p.venues.forEach((v, i) => {
        if (!inBounds(v.geo, bbox))
          ctx.addIssue({ code: "custom", message: `Ort außerhalb der Region ${p.region}`, path: ["venues", i, "geo"] });
      });
    }),
  z
    .strictObject({
      id: kebab,
      role: z.literal("aggregator"),
      ...sourceBase,
      /** Pflicht: Ein Sammelkalender ohne Adapter ist für die Pipeline ein `verzeichnis` (Plan 0031, E5) */
      adapter: z.enum(AGGREGATOR_ADAPTERS),
    })
    .superRefine((p, ctx) => {
      // das Abfragefenster eines Sammelkalenders setzt sein Adapter, nicht die URL (Plan 0031, Review 2 m7)
      p.programme.forEach((g, i) => {
        if (/\{(von|bis)\}/.test(g.url + (g.request?.body ?? "")))
          ctx.addIssue({
            code: "custom",
            message: "keine Platzhalter bei Sammelkalendern mit adapter",
            path: ["programme", i],
          });
      });
    }),
  z.strictObject({ id: kebab, role: z.literal("verzeichnis"), ...sourceBase }),
]);

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

/** Felder eines Angebots ohne Querprüfungen – Basis für Offer und das Rohformat der Pipeline (ADR 0006). */
export const OfferFields = z.strictObject({
  /** deterministisch, siehe ids.ts (ADR 0003, ADR 0006) */
  id: z.string().max(MAX_OFFER_ID).regex(OFFER_ID_PATTERN),
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
});

export const Offer = OfferFields.refine(
  (o) => o.id.startsWith(`${o.providerId}--`) && o.id.endsWith(`--${o.venueId}`),
  {
    message: "id muss mit providerId-- beginnen und mit --venueId enden",
    path: ["id"],
  },
)
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

/** „08:30“ */
const ClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM erwartet");
/** Bit 1 = Einsteigen erlaubt, Bit 2 = Aussteigen erlaubt (GTFS pickup_type/drop_off_type = 0) */
const StopFlags = z.int().min(0).max(3);

/** Verkehrsmittel einer Fahrt aus GTFS `route_type` 0–3 (Plan 0012, E1) */
const TransitMode = z.enum(["tram", "u-bahn", "bahn", "bus"]);

const TimetableTrip = z
  .strictObject({
    /** Kurzname der Linie („U1“, „36“), für die Anzeige der Linien (Plan 0012) */
    route: z.string().min(1),
    /** Verkehrsmittel, für den Anzeigenamen („Tram 4“, „Bus 36“, „U1“; Plan 0012, E1) */
    mode: TransitMode,
    /** Indizes in `stops` */
    stops: z.array(z.int().nonnegative()).min(2),
    /** je Halt [an, ab] in Sekunden ab Mitternacht des Stichtags; ab dem zweiten Wert als Differenz (≥ 0) */
    times: z.array(z.int()),
    flags: z.array(StopFlags),
  })
  .refine((t) => t.times.length === 2 * t.stops.length, { message: "times braucht 2 Werte je Halt", path: ["times"] })
  .refine((t) => t.times.every((x) => x >= 0), { message: "Zeiten dürfen nicht rückwärts laufen", path: ["times"] })
  .refine((t) => t.flags.length === t.stops.length, { message: "flags braucht 1 Wert je Halt", path: ["flags"] });

/**
 * Fahrplanauszug für die Wegzeit (Plan 0009, E4; ADR 0011): ein Referenz-Dienstag, Fahrten im Großraum,
 * Abfahrtsfenster. Erzeugt von `pnpm pipeline oepnv` aus den VGN-Soll-Daten (CC BY-SA 3.0 DE).
 */
export const Timetable = z
  .strictObject({
    /** Namensnennung nach CC BY-SA 3.0 DE, Abschnitt 4a/4c (Plan 0009, E3) */
    source: z.strictObject({
      attribution: z.string().min(1),
      title: z.string().min(1),
      url: z.url(),
      download: z.url(),
      license: z.string().min(1),
      licenseUrl: z.url(),
      /** Last-Modified des Feeds */
      modified: Instant,
      validFrom: IsoDate,
      validTo: IsoDate,
      fetchedAt: Instant,
    }),
    /** Referenz-Dienstag */
    serviceDay: IsoDate,
    /** Abfahrtsfenster */
    window: z.strictObject({ from: ClockTime, to: ClockTime }),
    /** Steige: [DHID, lat, lon] */
    stops: z.array(z.tuple([z.string().min(1), z.number(), z.number()])),
    trips: z.array(TimetableTrip),
  })
  .refine((t) => t.window.from < t.window.to, { message: "window.from muss vor window.to liegen", path: ["window"] })
  .refine((t) => isoWeekday(t.serviceDay) === 2, { message: "Stichtag muss ein Dienstag sein", path: ["serviceDay"] })
  .refine((t) => t.source.validFrom <= t.serviceDay && t.serviceDay <= t.source.validTo, {
    message: "Stichtag muss im Gültigkeitszeitraum liegen",
    path: ["serviceDay"],
  })
  .refine((t) => t.stops.every(([, lat, lon]) => inBounds({ lat, lon })), {
    message: "alle Steige müssen in NUERNBERG_BBOX liegen",
    path: ["stops"],
  })
  .refine((t) => t.trips.every((trip) => trip.stops.every((i) => i < t.stops.length)), {
    message: "Steig-Index außerhalb von stops",
    path: ["trips"],
  });

export type Venue = z.infer<typeof Venue>;
export type Provider = z.infer<typeof Provider>;
/** Katalog-Eintrag, der selbst veranstaltet: nur er hat Orte und Angebote */
export type Anbieter = Extract<Provider, { role: "anbieter" }>;
export type ProviderAge = z.infer<typeof ProviderAge>;
export type Session = z.infer<typeof Session>;
export type AgeRange = z.infer<typeof AgeRange>;
export type Offer = z.infer<typeof Offer>;
export type OffersFile = z.infer<typeof OffersFile>;
export type Timetable = z.infer<typeof Timetable>;
export type TransitMode = z.infer<typeof TransitMode>;
export type Format = z.infer<typeof Format>;
export type Registration = z.infer<typeof Registration>;
export type Cost = z.infer<typeof Cost>;
