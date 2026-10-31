/**
 * Rohformat der Extraktion (RawBatch, Events je Anbieter) und Zustand je Anbieter (ProviderRaw, `data/raw`) – ein
 * pipeline-internes ZWISCHENFORMAT, kein zweiter Datenvertrag (ADR 0006, ADR 0026): Die Felder sind aus OfferFields
 * abgeleitet, der Build des Nachtlaufs macht daraus data/offers.json. Exportiert nach schema/raw-batch.schema.json
 * und schema/provider-raw.schema.json.
 */
import { z } from "zod";
import { slug } from "../../../src/domain/ids.ts";
import { CategoryField, OfferFields, type Provider, ProviderAge } from "../../../src/domain/schema.ts";
import { berlinIsoDate, fromBerlinLocal } from "../../../src/domain/time.ts";
import { categoriesOf } from "../../../src/domain/topics.ts";
import { LocalDateTime, SOURCES } from "./candidate.ts";
import { type ExpandWindow, expandSchedule, Schedule } from "./schedule.ts";

export const RawEvent = OfferFields.pick({
  providerId: true,
  venueId: true,
  title: true,
  summary: true,
  topics: true,
  format: true,
  registration: true,
  cost: true,
  price: true,
  url: true,
  sourceUrl: true,
}).extend({
  /**
   * Hauptkategorie (ADR 0030). Steht bewusst hier und nicht im `pick`: Wird `OfferFields.category` in Stufe B Pflicht,
   * bleibt sie im Rohformat optional, und Antwortschema samt Cache-Schlüssel bleiben gleich (Plan 0037, E1, E3).
   * Optional bis Stufe C, weil alte Stände in `data/raw` sie nicht haben.
   */
  category: CategoryField.optional(),
  /** Alter laut Quelle; die Pipeline kappt auf 0–36 Monate */
  age: ProviderAge.optional(),
  availability: OfferFields.shape.availability.omit({ checkedAt: true }),
  registrationWindow: z
    .strictObject({ opens: LocalDateTime.optional(), deadline: LocalDateTime.optional() })
    .optional(),
  schedule: Schedule,
  /** Herkunft, wenn das Event aus einem Sammelkalender stammt (setzt der Code, nie das Modell; Plan 0032, E4) */
  via: z.enum(SOURCES).optional(),
  /**
   * ID-Erbe (Plan 0049, Nachtrag 2, B3): je Beginn (ISO mit Offset, wie `Session.start`) die alte ID, die das Angebot
   * dieses Termins behält, weil der Richter es als dasselbe erkannt hat. Setzt der Code, nie das Modell: Das
   * Antwortschema lässt das Feld weg (`ExtractResponse`), sonst könnte das Modell IDs vergeben.
   */
  keepIds: z.record(z.string(), z.string().min(1)).optional(),
});
export type RawEvent = z.infer<typeof RawEvent>;

export const ProviderCheck = z.strictObject({
  status: z.enum(["ok", "keine-termine", "fehler"]),
  /** Pflicht bei fehler: konkreter Grund */
  reason: z.string().optional(),
  note: z.string().optional(),
  /** alle abgerufenen URLs */
  checked: z.array(z.string()),
  /** Drift für die Katalogpflege: tote URL, Umzug, neues Buchungssystem, Schließung */
  drift: z.string().optional(),
});
export type ProviderCheck = z.infer<typeof ProviderCheck>;

export const RawBatch = z.strictObject({
  providers: z.record(z.string(), ProviderCheck),
  events: z.array(RawEvent),
});
export type RawBatch = z.infer<typeof RawBatch>;

const Instant = z.iso.datetime({ offset: true, local: false });
const DatedKey = z.record(z.iso.date(), z.string().min(1));

const Pending = z.strictObject({
  inputHash: z.string().min(1),
  dated: DatedKey.optional(),
  model: z.string().min(1),
  events: z.array(RawEvent),
});

/**
 * Vom ID-Gate gehaltenes Ergebnis (Plan 0049, Nachtrag 2, B4): eine neue Fassung hätte IDs gekostet. `unklar`: Der
 * Richter konnte nicht zuordnen, die Einheit bleibt beim alten Stand, bis sich der Schlüssel wieder ändert oder ein
 * Mensch hinnimmt. `grenze`: Richter nicht gelaufen (Bremse, Zeit, Fehler); die nächste Nacht richtet erneut.
 */
const Held = Pending.extend({
  since: Instant,
  reason: z.enum(["unklar", "grenze"]),
  /** IDs, die verloren gingen */
  lost: z.array(z.string().min(1)),
});

/** Felder, die Anbieter (V1) und Einheit (V2) gemeinsam haben, mit denselben Regeln (Plan 0032, E5). */
const stateFields = {
  /** zuletzt übernommene Events; `via` setzt der Code (E4) */
  events: z.array(RawEvent),
  /**
   * Schlüssel der Eingabe, aus der `events` stammen (`extractKey`, E4). Fehlt, solange nie extrahiert wurde (erster
   * Lauf mit Fehler oder zurückgehaltenem Einbruch, entfernte Seite); dann gilt für `build` der Vorstand.
   */
  inputHash: z.string().min(1).optional(),
  /**
   * Datierte Bestandteile der Eingabe (`ExtractKey.dated`): je letztem Tag ab dem Lauf ein Hash. Verglichen wird nur
   * ab heute, so ändern vergangene Termine den Schlüssel nicht (Plan 0032, Kostenhebel). Nur mit `inputHash`.
   */
  dated: DatedKey.optional(),
  /** Modell, das `events` geliefert hat (bei Fallback das Fallback-Modell) */
  model: z.string().min(1).optional(),
  status: ProviderCheck.shape.status,
  /** Pflicht bei fehler */
  reason: z.string().optional(),
  /** letzte Abrufzeit, zu der die Seite `events` bestätigt hat; Stand der Verfügbarkeit (`availability.checkedAt`) */
  checkedAt: Instant,
  /** letzte Änderung von `events` */
  changedAt: Instant.optional(),
  /** erster Lauf der aktuellen Fehlerserie */
  failingSince: Instant.optional(),
  /** zurückgehaltener Einbruch (E5): wird übernommen, wenn die nächste Nacht dieselbe Eingabe liefert */
  pending: Pending.optional(),
};

type StateShape = {
  events: readonly unknown[];
  inputHash?: string | undefined;
  dated?: unknown;
  model?: string | undefined;
  changedAt?: string | undefined;
  status: string;
  reason?: string | undefined;
  failingSince?: string | undefined;
};

function stateRules(r: StateShape, ctx: z.RefinementCtx): void {
  if (r.status === "fehler" && !r.reason)
    ctx.addIssue({ code: "custom", message: "status fehler braucht einen reason", path: ["reason"] });
  if (r.status === "fehler" && !r.failingSince)
    ctx.addIssue({ code: "custom", message: "status fehler braucht failingSince", path: ["failingSince"] });
  if (r.status !== "fehler" && r.failingSince)
    ctx.addIssue({ code: "custom", message: "failingSince nur bei status fehler", path: ["failingSince"] });
  if (r.inputHash === undefined && (r.events.length > 0 || r.status !== "fehler"))
    ctx.addIssue({ code: "custom", message: "ohne inputHash nur status fehler ohne Events", path: ["inputHash"] });
  if (r.dated !== undefined && r.inputHash === undefined)
    ctx.addIssue({ code: "custom", message: "dated nur mit inputHash", path: ["dated"] });
  if (
    (r.inputHash === undefined) !== (r.model === undefined) ||
    (r.inputHash === undefined) !== (r.changedAt === undefined)
  )
    ctx.addIssue({
      code: "custom",
      message: "inputHash, model und changedAt gibt es nur zusammen",
      path: ["inputHash"],
    });
}

/**
 * Zustand je Anbieter im alten Format (V1, ohne `version`; Plan 0032, E5). Gültig bis Plan 0048, S5: Die Umstellung
 * schreibt jeden Anbieter in V2, sobald alle seine Einheiten ein Ergebnis haben (E7).
 */
export const ProviderRawV1 = z
  .strictObject({
    ...stateFields,
    /** Sammelkalender, die Kandidaten zur Eingabe beigetragen haben */
    sources: z.array(z.enum(SOURCES)),
  })
  .superRefine(stateRules);
export type ProviderRawV1 = z.infer<typeof ProviderRawV1>;

/** Fehlerklasse eines Abrufs (Plan 0048, E8): 404/410 dauerhaft, robots.txt gesperrt, sonst vorübergehend. */
export const FailureClass = z.enum(["dauerhaft", "gesperrt", "voruebergehend"]);
export type FailureClass = z.infer<typeof FailureClass>;

const klasseFields = {
  /** nur bei fehler aus dem Abruf */
  klasse: FailureClass.optional(),
  /** Beginn der aktuellen Klasse (E5: entfernte Seite nach 14 Tagen `dauerhaft`), nur mit `klasse` */
  klasseSince: Instant.optional(),
};

function klasseRules(
  r: { status: string; klasse?: string | undefined; klasseSince?: string | undefined },
  ctx: z.RefinementCtx,
) {
  if ((r.klasse === undefined) !== (r.klasseSince === undefined))
    ctx.addIssue({ code: "custom", message: "klasse und klasseSince gibt es nur zusammen", path: ["klasse"] });
  if (r.klasse !== undefined && r.status !== "fehler")
    ctx.addIssue({ code: "custom", message: "klasse nur bei status fehler", path: ["klasse"] });
}

/** Zustand einer Einheit (Plan 0048, E4): wie ein Anbieter in V1, dazu Fehlerklasse und `emptySince`. */
export const UnitState = z
  .strictObject({
    ...stateFields,
    ...klasseFields,
    /** Events vorhanden, aber keine künftigen mehr (E5, ADR 0033, Punkt 3) */
    emptySince: Instant.optional(),
    /**
     * Seite als entfernt gewertet (E5: 14 Tage 404/410): Events und Schlüssel sind weg, und der Build übernimmt nichts
     * aus dem Vorstand. Nur bei fehler ohne inputHash; endet mit der nächsten Extraktion.
     */
    removedAt: Instant.optional(),
    /** Sammelkalender, die Kandidaten beigetragen haben; nur bei der Einheit `kandidaten` */
    sources: z.array(z.enum(SOURCES)).optional(),
    /**
     * Fassung der Pipeline, aus der `events` stammen (`ExtractKey.parts`: Katalogauszug, Prompt, Schema, Modell,
     * `INPUT_EPOCH`; Plan 0049, Nachtrag 2, B1). Fehlt bei Ständen vor dem ID-Gate; dann zählt jede Übernahme als
     * neue Fassung.
     */
    partsHash: z.string().min(1).optional(),
    held: Held.optional(),
  })
  .superRefine((r, ctx) => {
    stateRules(r, ctx);
    klasseRules(r, ctx);
    if ((r.partsHash !== undefined || r.held !== undefined) && r.inputHash === undefined)
      ctx.addIssue({ code: "custom", message: "partsHash und held nur mit inputHash", path: ["partsHash"] });
    if (r.removedAt !== undefined && (r.status !== "fehler" || r.inputHash !== undefined || r.events.length > 0))
      ctx.addIssue({
        code: "custom",
        message: "removedAt nur bei fehler ohne inputHash und Events",
        path: ["removedAt"],
      });
  });
export type UnitState = z.infer<typeof UnitState>;

/** Zustand einer Beilage (`use: verfuegbarkeit`, E1): nur der Abruf. */
export const BeilageState = z
  .strictObject({
    status: z.enum(["ok", "fehler"]),
    reason: z.string().optional(),
    ...klasseFields,
    checkedAt: Instant,
    failingSince: Instant.optional(),
  })
  .superRefine((r, ctx) => {
    klasseRules(r, ctx);
    if ((r.status === "fehler") !== (r.reason !== undefined && r.failingSince !== undefined))
      ctx.addIssue({ code: "custom", message: "reason und failingSince genau bei status fehler", path: ["status"] });
  });
export type BeilageState = z.infer<typeof BeilageState>;

/**
 * Zustand je Anbieter, Version 2 (Plan 0048, E4): je Einheit (Kennung aus `lib/units.ts`) ein `UnitState`, dazu die
 * Beilagen. Den Status des Anbieters berechnet `providerStatus`, er wird nicht gespeichert.
 */
export const ProviderRawV2 = z
  .strictObject({
    version: z.literal(2),
    units: z.record(z.string().regex(/^(seite:.+|kandidaten)$/), UnitState),
    beilagen: z.record(z.string().regex(/^seite:.+$/), BeilageState).optional(),
  })
  .superRefine((r, ctx) => {
    for (const [id, u] of Object.entries(r.units))
      if (u.sources !== undefined && id !== "kandidaten")
        ctx.addIssue({ code: "custom", message: "sources nur bei kandidaten", path: ["units", id, "sources"] });
  });
export type ProviderRawV2 = z.infer<typeof ProviderRawV2>;

/**
 * Zustand je Anbieter in `data/raw/<providerId>.json` (Plan 0032, E5; Plan 0048, E4): dauerhafter Zustand der
 * Pipeline, kein Vertrag der Website. Den Inhalt erzeugt nur `refreshProvider` (`io/refresh.ts`, Regeln in
 * `lib/refresh.ts`); das Entdecken kopiert bei Aufnahme nur seinen Ertragsbeweis hierher. Bis S5 V1 oder V2.
 * Der Build in `pipeline nightly` macht daraus `data/offers.json`. Exportiert nach schema/provider-raw.schema.json.
 */
export const ProviderRaw = z.union([ProviderRawV2, ProviderRawV1]);
export type ProviderRaw = z.infer<typeof ProviderRaw>;

export const isV2 = (raw: ProviderRaw): raw is ProviderRawV2 => "version" in raw;

/**
 * Status des Anbieters (E4), berechnet: `fehler`, wenn alle Einheiten `fehler` sind; `keine-termine`, wenn keine
 * Einheit Events hat; sonst `ok`, dazu die Zahl der Einheiten im Fehler. V1 trägt den Status selbst.
 */
export function providerStatus(raw: ProviderRaw): {
  status: ProviderCheck["status"];
  reason?: string;
  failingSince?: string;
  failedUnits: number;
} {
  if (!isV2(raw))
    return {
      status: raw.status,
      ...(raw.reason ? { reason: raw.reason } : {}),
      ...(raw.failingSince ? { failingSince: raw.failingSince } : {}),
      failedUnits: raw.status === "fehler" ? 1 : 0,
    };
  const units = Object.entries(raw.units);
  const failed = units.filter(([, u]) => u.status === "fehler");
  const reasons = failed.map(([id, u]) => `${id}: ${u.reason ?? "Fehler"}`).join("; ");
  const since = failed.map(([, u]) => u.failingSince ?? "").sort()[0];
  if (units.length > 0 && failed.length === units.length)
    return { status: "fehler", reason: reasons, ...(since ? { failingSince: since } : {}), failedUnits: failed.length };
  const status = units.some(([, u]) => u.events.length > 0) ? "ok" : "keine-termine";
  return { status, ...(failed.length > 0 ? { reason: reasons } : {}), failedUnits: failed.length };
}

/** Zustände je Einheit mit Kennung; V1 als eine Einheit ohne Kennung (`""`). */
export const unitStates = (raw: ProviderRaw): Array<[string, ProviderRawV1 | UnitState]> =>
  isV2(raw) ? Object.entries(raw.units) : [["", raw]];

/** Alle Events eines Zustands (V1: der Anbieter; V2: alle Einheiten in gespeicherter Reihenfolge). */
export const rawEvents = (raw: ProviderRaw): RawEvent[] =>
  isV2(raw) ? Object.values(raw.units).flatMap((u) => u.events) : raw.events;

/** Ob Events aus einer Extraktion stammen (Build: keine Übernahme aus dem Vorstand, Arch-Review S2, m2). */
export const rawExtracted = (raw: ProviderRaw): boolean =>
  isV2(raw)
    ? // eine entfernte Seite zählt mit: Ihre Angebote sollen wegfallen, nicht aus dem Vorstand kommen (Arch-Review M1)
      Object.values(raw.units).some((u) => u.inputHash !== undefined || u.removedAt !== undefined)
    : raw.inputHash !== undefined;

/** Prüfung einer Datei `data/raw/<id>.json` für `pnpm data:validate` (E13): Schema, Katalog-Anbieter, eigene Events. */
export function providerRawIssues(label: string, id: string, raw: unknown, anbieter: ReadonlySet<string>): string[] {
  // gezielt je Version: Die Vereinigung meldete sonst nur „Invalid input“ an der Wurzel
  const versioned = typeof raw === "object" && raw !== null && "version" in raw;
  const r = (versioned ? ProviderRawV2 : ProviderRawV1).safeParse(raw);
  if (!r.success) return r.error.issues.map((i) => `${label}: ${i.path.join(".") || "(Wurzel)"}: ${i.message}`);
  const issues: string[] = [];
  if (!anbieter.has(id)) issues.push(`${label}: ${id} ist kein Anbieter im Katalog (räumt der nächste Nachtlauf weg)`);
  const states = isV2(r.data) ? Object.values(r.data.units) : [r.data];
  for (const e of states.flatMap((s) => [...s.events, ...(s.pending?.events ?? [])]))
    if (e.providerId !== id) issues.push(`${label}: Event „${e.title}“ gehört zu ${e.providerId}`);
  return issues;
}

export interface RawContext {
  providers: readonly Provider[];
  /** Anbieter, die einen Status brauchen */
  expected?: readonly string[];
  horizon: { from: string; to: string };
  freeDays: ExpandWindow["freeDays"];
}

export type RawValidation =
  | { ok: true; batch: RawBatch; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

/** Termine einer Regel im Expansionsfenster: Kurse mit Ende laufen über den Horizont hinaus (Plan 0002, E6). */
export function expansionWindow(event: Pick<RawEvent, "format" | "schedule">, horizonTo: string): string {
  const s = event.schedule;
  const bounded = s.kind !== "dates" && (s.until !== undefined || s.count !== undefined);
  if (event.format === "kurs" && bounded) return s.until ?? `${Number(horizonTo.slice(0, 4)) + 2}${horizonTo.slice(4)}`;
  return horizonTo;
}

/** Text der Warnung „category passt zu keinem Thema“; der Nachtlauf-Bericht zählt sie (Plan 0037, E2) */
export const CATEGORY_CONFLICT = "passt zu keinem Thema";

const where = (i: number, e: { title?: unknown }) => `events.${i} („${String(e.title ?? "?")}“)`;

/** Schema + Katalog-Referenzen + Vollständigkeit + Termin-Probelauf. Meldungen nennen Pfad und Feld. */
export function validateRaw(input: unknown, ctx: RawContext): RawValidation {
  const warnings: string[] = [];
  const parsed = RawBatch.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => {
      const [head, idx, ...rest] = i.path;
      const title =
        head === "events" && typeof idx === "number"
          ? ` („${String((input as { events?: Array<{ title?: unknown }> }).events?.[idx]?.title ?? "?")}“)`
          : "";
      return `${[head, idx].filter((x) => x !== undefined).join(".")}${title}${rest.length ? `.${rest.join(".")}` : ""}: ${i.message}`;
    });
    return { ok: false, errors, warnings };
  }
  const batch = parsed.data;
  const errors: string[] = [];
  const byId = new Map(ctx.providers.map((p) => [p.id, p] as const));

  for (const id of ctx.expected ?? []) if (!batch.providers[id]) errors.push(`providers: Status für ${id} fehlt`);
  for (const [id, check] of Object.entries(batch.providers)) {
    if (!byId.has(id)) errors.push(`providers.${id}: unbekannter Anbieter`);
    if (check.status === "fehler" && !check.reason) errors.push(`providers.${id}: status fehler braucht einen reason`);
  }

  // Regelmäßige Angebote: Die ID hängt nur am gekürzten Titel – verschiedene Titel dürfen nicht kollidieren (ADR 0006).
  const regularIds = new Map<string, string>();
  batch.events.forEach((e, i) => {
    if (e.format !== "regelmaessig") return;
    const key = `${e.providerId}--${slug(e.title)}--${e.venueId}`;
    const other = regularIds.get(key);
    if (other !== undefined && other !== e.title)
      errors.push(
        `${where(i, e)}: gleiche ID wie „${other}“ – die Titel unterscheiden sich erst nach 60 Zeichen. Titel vorne unterscheidbar machen`,
      );
    regularIds.set(key, e.title);
  });

  batch.events.forEach((e, i) => {
    const w = where(i, e);
    const provider = byId.get(e.providerId);
    // Querprüfung von `Offer`, die `RawEvent` (aus `OfferFields`) nicht mitbringt: sonst fiele es erst im Build auf
    if (categoriesOf(e.topics).length === 0)
      errors.push(`${w}.topics: mindestens ein Thema muss einer Kategorie zugeordnet sein`);
    // Nur eine Warnung: Die Hauptkategorie wählt das Modell, ein Widerspruch zu den Themen schadet nicht (Plan 0037, E2)
    if (e.category !== undefined && !categoriesOf(e.topics).includes(e.category))
      warnings.push(`${w}.category: ${e.category} ${CATEGORY_CONFLICT} (${e.topics.join(", ")})`);
    if (!provider) errors.push(`${w}: unbekannter Anbieter ${e.providerId}`);
    else if (provider.role !== "anbieter") errors.push(`${w}: ${e.providerId} ist kein Anbieter (${provider.role})`);
    else if (!provider.venues.some((v) => v.id === e.venueId))
      errors.push(
        `${w}: Ort ${e.venueId} gehört nicht zu ${e.providerId} (Orte: ${provider.venues.map((v) => v.id).join(", ")})`,
      );
    const occurrences = expandSchedule(e.schedule, {
      to: expansionWindow(e, ctx.horizon.to),
      freeDays: ctx.freeDays,
      ...(e.format === "kurs" ? {} : { from: ctx.horizon.from }),
    });
    for (const o of occurrences) {
      for (const t of [o.start, o.end]) {
        if (t === undefined) continue;
        try {
          fromBerlinLocal(t);
        } catch (err) {
          errors.push(`${w}: ${(err as Error).message}`);
        }
      }
      if (o.end !== undefined && o.end <= o.start)
        errors.push(`${w}: Ende ${o.end} liegt nicht nach Beginn ${o.start}`);
    }
    const inHorizon = occurrences.filter(
      (o) => o.start.slice(0, 10) >= ctx.horizon.from && o.start <= `${ctx.horizon.to}T24`,
    );
    if (e.format !== "kurs" && inHorizon.length === 0)
      warnings.push(`${w}: kein Termin im Horizont ${ctx.horizon.from}–${ctx.horizon.to} – entfällt`);
    if (e.format === "kurs" && (occurrences.at(-1)?.start.slice(0, 10) ?? "") < ctx.horizon.from)
      warnings.push(`${w}: Kurs ist schon vorbei – entfällt`);
    if (e.format === "kurs" && (occurrences[0]?.start.slice(0, 10) ?? "") > ctx.horizon.to)
      warnings.push(`${w}: Kurs beginnt nach dem Horizont – entfällt`);
    if (e.age && e.age.minMonths > 36) warnings.push(`${w}: erst ab ${e.age.minMonths} Monaten – entfällt`);
  });

  return errors.length > 0 ? { ok: false, errors, warnings } : { ok: true, batch, warnings };
}

/**
 * Hinnehmen eines ID-Verlusts (ADR 0041, Punkt 7; Plan 0049, Nachtrag 2, B5): `data/id-hinnehmen.yaml`, von Hand
 * gepflegt und committet, die einzige Ausnahme vom ID-Gate ohne Richter. Ein Eintrag lässt den nächsten Nachtlauf
 * `held.events` des Anbieters ohne Richter übernehmen; er wirkt nur auf ein `held`, das spätestens am `datum`
 * (Europe/Berlin) entstand, ein späterer Verlust braucht einen neuen Eintrag. Fehlt die Datei, gilt die leere Liste.
 */
export const IdAcceptance = z.array(
  z.strictObject({
    /** Katalog-ID des Anbieters */
    anbieter: z.string().min(1),
    /** warum der Verlust hingenommen wird; steht im Bericht und im Commit-Text */
    grund: z.string().min(1),
    /** Tag der Entscheidung */
    datum: z.iso.date(),
  }),
);
export type IdAcceptance = z.infer<typeof IdAcceptance>;

/**
 * Eintrag, der das `held` eines Anbieters seit `heldSince` (Instant) hinnimmt: `datum` ≥ Berliner Datum von
 * `heldSince`; bei mehreren der späteste.
 */
export function acceptanceFor(
  entries: IdAcceptance,
  providerId: string,
  heldSince: string,
): { grund: string; datum: string } | undefined {
  const day = berlinIsoDate(heldSince);
  const hit = entries
    .filter((e) => e.anbieter === providerId && e.datum >= day)
    .sort((a, b) => b.datum.localeCompare(a.datum))[0];
  return hit && { grund: hit.grund, datum: hit.datum };
}

/** Befunde für `pnpm data:validate`: Schema, und jede `anbieter`-ID steht im Katalog */
export function idAcceptanceIssues(label: string, input: unknown, providerIds: ReadonlySet<string>): string[] {
  const r = IdAcceptance.safeParse(input);
  if (!r.success) return r.error.issues.map((i) => `${label}: ${i.path.join(".") || "(Wurzel)"}: ${i.message}`);
  return r.data.flatMap((e, i) =>
    providerIds.has(e.anbieter) ? [] : [`${label}: Eintrag ${i + 1}: ${e.anbieter} ist kein Anbieter im Katalog`],
  );
}
