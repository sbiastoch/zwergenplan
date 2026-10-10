/**
 * Rohformat der Recherche-Subagenten (RawBatch) – ein pipeline-internes ZWISCHENFORMAT, kein zweiter
 * Datenvertrag (ADR 0006): Die Felder sind aus OfferFields abgeleitet, `pipeline build` macht daraus
 * data/offers.json. Exportiert nach schema/raw-batch.schema.json als Vorlage für die Agenten.
 */
import { z } from "zod";
import { slug } from "../../../src/domain/ids.ts";
import { OfferFields, type Provider, ProviderAge } from "../../../src/domain/schema.ts";
import { fromBerlinLocal } from "../../../src/domain/time.ts";
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
  /** Alter laut Quelle; die Pipeline kappt auf 0–36 Monate */
  age: ProviderAge.optional(),
  availability: OfferFields.shape.availability.omit({ checkedAt: true }),
  registrationWindow: z
    .strictObject({ opens: LocalDateTime.optional(), deadline: LocalDateTime.optional() })
    .optional(),
  schedule: Schedule,
  /** Herkunft, wenn das Event aus einem Sammelkalender stammt (setzt `candidates keep`) */
  via: z.enum(SOURCES).optional(),
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

export interface RawContext {
  providers: readonly Provider[];
  /** Anbieter des zugehörigen Pakets – jeder braucht einen Status */
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
