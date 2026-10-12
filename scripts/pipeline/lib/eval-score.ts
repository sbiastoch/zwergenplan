/**
 * Eval der Extraktion (Plan 0032, E9), reine Teile: Form der eingefrorenen Fälle (`evals/cases/<fall>/input.json`,
 * `expected.json`), Expansion der Antwort mit derselben Build-Funktion wie der Nachtlauf, deterministische Bewertung
 * und die Zeile für `evals/results.md`. Aufruf und Dateien: `io/eval.ts`.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { CategoryField, type Offer, OfferFields, Provider } from "../../../src/domain/schema.ts";
import { addMonths, berlinIsoDate, fromBerlinLocal } from "../../../src/domain/time.ts";
import { categoriesOf, fallbackCategory } from "../../../src/domain/topics.ts";
import { buildOffers, HORIZON_MONTHS } from "./build-offers.ts";
import { Candidate, type Source } from "./candidate.ts";
import type { CallRecord } from "./extract.ts";
import type { RawEvent } from "./raw.ts";
import { similarTitle } from "./similar.ts";

/** Art eines Falls (E9): Abrufart, Sammelkalender-Kandidaten, große Eingabe, keine Termine. */
export const CASE_KINDS = [
  "html",
  "browser",
  "ical",
  "pdf",
  "json-api",
  "kandidaten",
  "gross",
  "keine-termine",
] as const;
/** Fallen (E9): Die richtige Antwort lässt diese Angebote weg. */
export const TRAPS = ["ab-3-jahren", "eltern-ohne-kind", "vergangen"] as const;

const Instant = z.iso.datetime({ offset: true, local: false });
const IsoDate = z.iso.date();

/**
 * Eingefrorene Eingabe eines Falls: genau das, was der Nachtlauf dem Extraktor gibt (`ExtractInput`), statt des
 * Katalogs aber ein Schnappschuss des Eintrags. So ändert eine spätere Katalogpflege den Fall nicht still.
 */
export const EvalInput = z.strictObject({
  kinds: z.array(z.enum(CASE_KINDS)).min(1),
  traps: z.array(z.enum(TRAPS)),
  /** erkennbar fiktive Eingabe (Falle, die es im Katalog nicht gibt) */
  synthetic: z.boolean(),
  /** woher die Eingabe stammt (Abrufdatum bzw. „von Hand gebaut“) */
  origin: z.string().min(1),
  providerId: z.string().min(1),
  /** Katalogeintrag zum Zeitpunkt des Einfrierens */
  catalog: Provider,
  today: IsoDate,
  text: z.string(),
  candidates: z.array(Candidate),
  allowedUrls: z.array(z.string()),
  /** URLs der Seiten in Abrufreihenfolge: nur ihre Kopfzeilen sind Schnittstellen beim Aufteilen (`lib/split.ts`) */
  pageUrls: z.array(z.string()),
});
export type EvalInput = z.infer<typeof EvalInput>;

/** Ein Angebot in der Form, die die Bewertung vergleicht: Felder mit Feldtreffer und die Beginnzeiten im Fenster. */
export const EvalOffer = z.strictObject({
  /** ID im Bestand, nur zur Orientierung */
  id: z.string().optional(),
  title: z.string(),
  venueId: z.string(),
  format: OfferFields.shape.format,
  registration: OfferFields.shape.registration,
  cost: OfferFields.shape.cost,
  /** Hauptkategorie (Plan 0037, E10), exakt bewertet */
  category: CategoryField,
  topics: OfferFields.shape.topics,
  availability: z.strictObject({ status: OfferFields.shape.availability.shape.status }),
  starts: z.array(Instant).min(1),
});
export type EvalOffer = z.infer<typeof EvalOffer>;

export const EvalExpected = z.strictObject({
  /** Herkunft, etwa „data/offers.json vom 2026-10-04, von Hand geprüft (NOTES.md)“ */
  basis: z.string().min(1),
  /** bewertet werden nur Termine, deren Berliner Kalendertag hier liegt */
  window: z.strictObject({ from: IsoDate, to: IsoDate }),
  offers: z.array(EvalOffer),
});
export type EvalExpected = z.infer<typeof EvalExpected>;

export interface Window {
  from: string;
  to: string;
}

const inWindow = (start: string, w: Window) => {
  const day = berlinIsoDate(start);
  return day >= w.from && day <= w.to;
};

/** Angebote (Bestand oder Build) → Vergleichsform; nur Termine im Fenster, Angebote ohne solche entfallen. */
export function toEvalOffers(offers: readonly Offer[], window: Window): EvalOffer[] {
  return offers.flatMap((o) => {
    const starts = o.sessions.map((s) => s.start).filter((s) => inWindow(s, window));
    if (starts.length === 0) return [];
    return [
      {
        ...(o.id ? { id: o.id } : {}),
        title: o.title,
        venueId: o.venueId,
        format: o.format,
        registration: o.registration,
        cost: o.cost,
        // Übergang Plan 0037 (E10): Rückfall für Bestände ohne category (`pnpm eval freeze`); entfällt in Stufe C
        category: o.category ?? fallbackCategory(o.topics),
        topics: o.topics,
        availability: { status: o.availability.status },
        starts,
      },
    ];
  });
}

/**
 * Antwort des Extraktors → Angebote wie im Nachtlauf: `buildOffers` mit Horizont heute + 12 Monate und denselben
 * freien Tagen, ohne Vorstand. `coveredBy` fällt für den Build weg (der Sammelkalender steht nicht im Schnappschuss
 * und zählt nur für die Übernahme aus dem Vorstand, die es hier nicht gibt).
 */
export function predictOffers(p: {
  events: readonly RawEvent[];
  provider: Provider;
  today: string;
  freeDays: Readonly<Record<string, string>>;
  window: Window;
}): { offers: EvalOffer[]; errors: string[] } {
  const provider =
    p.provider.role === "anbieter" && p.provider.coveredBy !== undefined
      ? (({ coveredBy: _, ...rest }) => rest)(p.provider)
      : p.provider;
  const sources: Partial<Record<Source, "ok">> = {};
  const { file, report } = buildOffers({
    batches: [
      {
        name: provider.id,
        checkedAt: fromBerlinLocal(`${p.today}T03:00`),
        batch: { providers: { [provider.id]: { status: "ok", checked: [] } }, events: [...p.events] },
      },
    ],
    providers: [provider],
    freeDays: p.freeDays,
    horizon: { from: p.today, to: addMonths(p.today, HORIZON_MONTHS) },
    generatedAt: fromBerlinLocal(`${p.today}T03:00`),
    sources,
  });
  if (!file) return { offers: [], errors: report.errors };
  return { offers: toEvalOffers(file.offers, p.window), errors: [] };
}

const FIELDS = ["format", "availability.status", "cost", "registration", "topics", "category"] as const;
type Field = (typeof FIELDS)[number];

interface Count {
  expected: number;
  predicted: number;
  matched: number;
}
interface Hits {
  hits: number;
  total: number;
}
export interface CaseScore {
  sessions: Count;
  offers: Count;
  fields: Record<Field, Hits>;
  /** vorhergesagte Angebote, deren `category` zu keinem ihrer Themen passt (Plan 0037, E10); Bezug `offers.predicted` */
  categoryConflicts: number;
}

const emptyFields = (): Record<Field, Hits> => ({
  format: { hits: 0, total: 0 },
  "availability.status": { hits: 0, total: 0 },
  cost: { hits: 0, total: 0 },
  registration: { hits: 0, total: 0 },
  topics: { hits: 0, total: 0 },
  category: { hits: 0, total: 0 },
});
const sessionKey = (venueId: string, start: string) => `${venueId}|${Date.parse(start)}`;
const sameTopics = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();
const fieldHit: Record<Field, (a: EvalOffer, b: EvalOffer) => boolean> = {
  format: (a, b) => a.format === b.format,
  "availability.status": (a, b) => a.availability.status === b.availability.status,
  cost: (a, b) => a.cost === b.cost,
  registration: (a, b) => a.registration === b.registration,
  topics: (a, b) => sameTopics(a.topics, b.topics),
  category: (a, b) => a.category === b.category,
};

/**
 * Bewertung eines Falls: Termine 1:1 über Ort und Beginn (bei mehreren Angeboten am selben Ort und Beginn zuerst
 * Paare mit ähnlichem Titel), Angebote 1:1 über die meisten gemeinsamen Termine, Feldtreffer je Angebotspaar.
 */
export function scoreCase(expected: readonly EvalOffer[], predicted: readonly EvalOffer[]): CaseScore {
  const slots = (offers: readonly EvalOffer[]) => {
    const m = new Map<string, number[]>();
    offers.forEach((o, i) => {
      for (const s of o.starts) {
        const k = sessionKey(o.venueId, s);
        m.set(k, [...(m.get(k) ?? []), i]);
      }
    });
    return m;
  };
  const exp = slots(expected);
  const pred = slots(predicted);
  // gemeinsame Termine je Angebotspaar, Schlüssel "e|p"
  const shared = new Map<string, { ei: number; pi: number; n: number }>();
  let matched = 0;
  for (const [key, es] of exp) {
    const ps = [...(pred.get(key) ?? [])];
    const open = [...es];
    const pair = (ei: number, pi: number) => {
      const k = `${ei}|${pi}`;
      shared.set(k, { ei, pi, n: (shared.get(k)?.n ?? 0) + 1 });
      matched++;
      open.splice(open.indexOf(ei), 1);
      ps.splice(ps.indexOf(pi), 1);
    };
    for (const ei of [...open]) {
      const pi = ps.find((i) => similarTitle(expected[ei]?.title ?? "", predicted[i]?.title ?? ""));
      if (pi !== undefined) pair(ei, pi);
    }
    for (const ei of [...open]) {
      const pi = ps[0];
      if (pi !== undefined) pair(ei, pi);
    }
  }
  const pairs = [...shared.values()].sort((a, b) => b.n - a.n || a.ei - b.ei || a.pi - b.pi);
  const usedE = new Set<number>();
  const usedP = new Set<number>();
  const fields = emptyFields();
  for (const { ei, pi } of pairs) {
    if (usedE.has(ei) || usedP.has(pi)) continue;
    usedE.add(ei);
    usedP.add(pi);
    const e = expected[ei];
    const p = predicted[pi];
    if (!e || !p) continue;
    for (const f of FIELDS) {
      fields[f].total++;
      if (fieldHit[f](e, p)) fields[f].hits++;
    }
  }
  const count = (offers: readonly EvalOffer[]) => offers.reduce((n, o) => n + o.starts.length, 0);
  return {
    sessions: { expected: count(expected), predicted: count(predicted), matched },
    offers: { expected: expected.length, predicted: predicted.length, matched: usedE.size },
    fields,
    categoryConflicts: predicted.filter((o) => !categoriesOf(o.topics).includes(o.category)).length,
  };
}

export interface CaseResult {
  name: string;
  /** `ok`: gültige Antwort; `fehler`: nach Wiederholung (und ggf. Fallback) ungültig, abgeschnitten oder Fehler */
  outcome: "ok" | "fehler";
  score: CaseScore;
  calls: readonly CallRecord[];
}

export interface Summary {
  cases: number;
  casesValid: number;
  calls: number;
  callsValid: number;
  sessions: Count;
  offers: Count;
  recall: number | null;
  precision: number | null;
  offerRecall: number | null;
  offerPrecision: number | null;
  fields: Record<Field, Hits>;
  /** vorhergesagte Angebote mit `category` ohne passendes Thema, über alle Fälle; Bezug `offers.predicted` */
  categoryConflicts: number;
  costUsd: number;
  durationMs: number;
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);
const add = (a: Count, b: Count): Count => ({
  expected: a.expected + b.expected,
  predicted: a.predicted + b.predicted,
  matched: a.matched + b.matched,
});

/** Kennzahlen über alle Fälle als Mikro-Mittel (Summen der Zähler und Nenner). */
export function summarize(results: readonly CaseResult[]): Summary {
  const zero: Count = { expected: 0, predicted: 0, matched: 0 };
  const sessions = results.reduce((s, r) => add(s, r.score.sessions), zero);
  const offers = results.reduce((s, r) => add(s, r.score.offers), zero);
  const fields = emptyFields();
  for (const r of results)
    for (const f of FIELDS) {
      fields[f].hits += r.score.fields[f].hits;
      fields[f].total += r.score.fields[f].total;
    }
  const calls = results.flatMap((r) => r.calls);
  return {
    cases: results.length,
    casesValid: results.filter((r) => r.outcome === "ok").length,
    calls: calls.length,
    callsValid: calls.filter((c) => c.result === "ok").length,
    sessions,
    offers,
    recall: ratio(sessions.matched, sessions.expected),
    precision: ratio(sessions.matched, sessions.predicted),
    offerRecall: ratio(offers.matched, offers.expected),
    offerPrecision: ratio(offers.matched, offers.predicted),
    fields,
    categoryConflicts: results.reduce((n, r) => n + r.score.categoryConflicts, 0),
    costUsd: calls.reduce((s, c) => s + (c.costUsd ?? 0), 0),
    durationMs: calls.reduce((s, c) => s + c.durationMs, 0),
  };
}

/** Grund, warum ein Lauf keine Zeile in results.md bekommt: nicht alle Fälle bewertet, keine gültige Antwort. */
export function unusableRun(results: readonly CaseResult[], cases: number): string | undefined {
  if (results.length !== cases) return `nur ${results.length} von ${cases} Fällen bewertet`;
  if (!results.some((r) => r.calls.some((c) => c.result === "ok"))) return "keine einzige gültige Antwort";
  return undefined;
}

/** Kurzer Hash über Prompt und Antwortschema (`EXTRACT_KEY_PARTS`): eine Zeile in results.md je Stand. */
export function promptHash(parts: { prompt: string; schema: string }): string {
  return createHash("sha256").update(parts.prompt).update(parts.schema).digest("hex").slice(0, 12);
}

export const RESULTS_HEADER = [
  "| Datum | Modell | Prompt-Hash | Fälle gültig | Aufrufe gültig | Termine R | Termine P | Angebote R | Angebote P | format | Platzstand | cost | registration | topics | category | Kat. ohne Thema | Kosten (USD, Schätzung) | Dauer | je Fall (Termine R/P in %, FP = falsch positive Termine) |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
].join("\n");

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}`);
const hitPct = (h: Hits) => (h.total === 0 ? "–" : `${Math.round((h.hits / h.total) * 100)} %`);
const shortName = (name: string) => name.replace(/-\d{4}-\d{2}-\d{2}$/, "");

function perCase(r: CaseResult): string {
  const name = shortName(r.name);
  if (r.outcome === "fehler") return `${name} fehler`;
  const s = r.score.sessions;
  if (s.expected === 0) return `${name} FP ${s.predicted}`;
  return `${name} ${pct(ratio(s.matched, s.expected))}/${pct(ratio(s.matched, s.predicted))}`;
}

/** Eine Tabellenzeile für `evals/results.md`. */
export function resultsRow(
  s: Summary,
  results: readonly CaseResult[],
  meta: { date: string; model: string; hash: string },
): string {
  const p = (v: number | null) => (v === null ? "–" : `${pct(v)} %`);
  const cells = [
    meta.date,
    meta.model,
    `\`${meta.hash}\``,
    `${s.casesValid}/${s.cases}`,
    `${s.callsValid}/${s.calls}`,
    p(s.recall),
    p(s.precision),
    p(s.offerRecall),
    p(s.offerPrecision),
    ...FIELDS.map((f) => hitPct(s.fields[f])),
    hitPct({ hits: s.categoryConflicts, total: s.offers.predicted }),
    `$${s.costUsd.toFixed(2)}`,
    `${Math.round(s.durationMs / 1000)} s`,
    results.map(perCase).join("; "),
  ];
  return `| ${cells.join(" | ")} |`;
}

/** Gibt es in `evals/results.md` eine Zeile für diesen Prompt-Hash? */
export function hasResultFor(resultsMd: string, hash: string): boolean {
  return resultsMd.split("\n").some((l) => l.startsWith("|") && l.includes(`\`${hash}\``));
}
