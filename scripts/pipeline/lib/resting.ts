/**
 * Ruhende Angebote (Plan 0061, E2; ADR 0044): ein Gedächtnis der Zuordnung über die Vornacht hinaus. Ein Angebot, das
 * im Vorstand stand und in der Ausgabe fehlt, ruht bis zu `RESTING_DAYS` Berliner Tage in `data/ruhend.json`. Kommt es
 * in der Zeit zurück, auch umformuliert, trifft die Zuordnung (`assignIds`, Durchgang 2) seine alte ID, und `listedAt`
 * bleibt. Die Ruhe ist keine Weiterleitung: Eine weggefallene ID zeigt nie auf ein anderes Angebot (ADR 0022).
 *
 * Zustand der Pipeline, kein Vertrag der Website: Das Schema liegt deshalb hier (wie `ProviderRaw`, `DiscoverState`),
 * die Felder kommen aus `OfferFields`. Rein, ohne Dateien: Lesen und Schreiben stehen in `io/files.ts`.
 */
import { z } from "zod";
import { type Offer, OfferFields, type OffersFile } from "../../../src/domain/schema.ts";
import { addDays, berlinIsoDate } from "../../../src/domain/time.ts";
import { keyOf } from "./stable-ids.ts";

/** Ruhezeit in Berliner Kalendertagen (Nutzerentscheid N2 zu Plan 0061) */
export const RESTING_DAYS = 56;
/** So weit reichen die gemerkten Beginne ab dem Ruhebeginn (Größe der Datei, Plan 0061, E2) */
export const RESTING_SPAN_DAYS = 112;

const Instant = OfferFields.shape.availability.shape.checkedAt;

export const RestingEntry = z.strictObject({
  id: OfferFields.shape.id,
  /** `offerKey` mit dem ersten Termin (`keyOf`): Saat der ID, für die Rückkehr ohne Seed-Wechsel (Review m3) */
  key: z.string().min(1),
  providerId: OfferFields.shape.providerId,
  venueId: OfferFields.shape.venueId,
  title: OfferFields.shape.title,
  format: OfferFields.shape.format,
  age: OfferFields.shape.age,
  listedAt: OfferFields.shape.listedAt,
  /** `generatedAt` des ersten Laufs ohne das Angebot */
  restingSince: Instant,
  /** letzter Berliner Tag, bis zu dem `starts` vollständig ist (Review M1) */
  horizonTo: z.iso.date(),
  /** Beginne ab dem Ruhebeginn bis `horizonTo`, mit Offset wie in `offers.json` (Arch-Review M2) */
  starts: z.array(Instant).min(1),
});
export type RestingEntry = z.infer<typeof RestingEntry>;

/**
 * Jede ID höchstens einmal (Arch-Review E2, m3): Zwei Einträge mit derselben ID gingen in Durchgang 2 an zwei Entwürfe,
 * der Build schlüge an der doppelten ID fehl und schriebe Nacht für Nacht nichts.
 */
export const RestingFile = z
  .strictObject({ generatedAt: Instant, entries: z.array(RestingEntry) })
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    f.entries.forEach((e, i) => {
      if (seen.has(e.id)) ctx.addIssue({ code: "custom", message: `ID ${e.id} doppelt`, path: ["entries", i, "id"] });
      seen.add(e.id);
    });
  });
export type RestingFile = z.infer<typeof RestingFile>;

/** Geprüft lesen; ungültig ist ein Rückgabewert, kein Wurf: Der Build fällt dann auf „ohne Ruhe“ zurück (E2). */
export function parseResting(value: unknown): { file: RestingFile } | { error: string } {
  const parsed = RestingFile.safeParse(value);
  return parsed.success
    ? { file: parsed.data }
    : { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

/** Ruht ein Angebot ab `today`: seine Beginne ab heute bis `horizonTo`; ohne einen keiner. */
function toEntry(
  offer: Offer,
  generatedAt: string,
  today: string,
  previousHorizonTo: string,
): RestingEntry | undefined {
  const cap = addDays(today, RESTING_SPAN_DAYS);
  const horizonTo = previousHorizonTo < cap ? previousHorizonTo : cap;
  const starts = offer.sessions
    .map((s) => s.start)
    .filter((start) => {
      const day = berlinIsoDate(start);
      return day >= today && day <= horizonTo;
    });
  if (starts.length === 0) return undefined;
  return {
    id: offer.id,
    key: keyOf(offer),
    providerId: offer.providerId,
    venueId: offer.venueId,
    title: offer.title,
    format: offer.format,
    ...(offer.age ? { age: offer.age } : {}),
    ...(offer.listedAt ? { listedAt: offer.listedAt } : {}),
    restingSince: generatedAt,
    horizonTo,
    starts,
  };
}

/**
 * Fortschreibung nach dem Build (Plan 0061, E2). Jede ID aus Vorstand oder alter Ruhe, die nicht in der Ausgabe steht,
 * ruht; ein schon ruhender Eintrag bleibt unverändert. Ein Eintrag entfällt, wenn er älter als `RESTING_DAYS` ist,
 * keinen Beginn ab heute mehr hat oder seine ID wieder in der Ausgabe steht. Ein Eintrag, dessen ID im Vorstand steht,
 * ist ein Rest aus einem abgebrochenen Lauf: Es gilt der Vorstand (Review m3).
 */
export function updateResting(o: {
  previous: OffersFile | undefined;
  resting: RestingFile | undefined;
  next: readonly Offer[];
  generatedAt: string;
  horizon: { from: string; to: string };
}): RestingFile {
  const today = o.horizon.from;
  const out = new Set(o.next.map((offer) => offer.id));
  const inPrevious = new Set(o.previous?.offers.map((offer) => offer.id));
  const entries: RestingEntry[] = [];
  for (const offer of o.previous?.offers ?? []) {
    if (out.has(offer.id) || !o.previous) continue;
    const entry = toEntry(offer, o.generatedAt, today, o.previous.horizon.to);
    if (entry) entries.push(entry);
  }
  for (const e of o.resting?.entries ?? []) {
    if (out.has(e.id) || inPrevious.has(e.id)) continue;
    if (addDays(berlinIsoDate(e.restingSince), RESTING_DAYS) < today) continue;
    if (!e.starts.some((start) => berlinIsoDate(start) >= today)) continue;
    entries.push(e);
  }
  return { generatedAt: o.generatedAt, entries: entries.sort((a, b) => a.id.localeCompare(b.id)) };
}
