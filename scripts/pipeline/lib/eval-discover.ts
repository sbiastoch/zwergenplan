/**
 * Entdecken-Eval (Plan 0050, E6), rein, ohne Dateizugriff: Format von `evals/discover.json`, die geschichtete
 * Ziehung mit festem Zufall (`scripts/pipeline/draw-eval-sample.ts`) und die Auswertung eines Laufs (Stufen,
 * Ertrag gegen die Referenz, Kennzahlen, Urteile, Zeile für `evals/results.md`, Modell und Laufverzeichnis).
 */
import { z } from "zod";
import { haversineMeters } from "../../../src/domain/geo.ts";
import { REGION_IDS, type RegionId } from "../../../src/domain/regions.ts";
import { addDays, fromBerlinLocal } from "../../../src/domain/time.ts";

/** Trägerarten (Plan 0045, E7); kein Katalogfeld, von Hand je Anbieter zugeordnet */
const TRAEGER_ARTEN = [
  "familienbildung",
  "gemeinde",
  "verein",
  "einzelperson",
  "schwimmschule",
  "musikschule",
  "familienzentrum",
  "plattform",
  "sonstige",
] as const;
type TraegerArt = (typeof TRAEGER_ARTEN)[number];

export const SAMPLE_SIZE = 20;

/**
 * Regionen der Anbieter je Stichprobe. Fürth hat keine eigene (zu wenige Anbieter); Fürther Anbieter stehen in der
 * Nürnberger, denn Nürnberg und Fürth laufen gemeinsam (Plan 0050, E6).
 */
export const SAMPLE_REGIONS: Readonly<Record<string, readonly RegionId[]>> = { nuernberg: ["nuernberg", "fuerth"] };

/**
 * Regionen eines Eval-Laufs in der Reihenfolge von `REGION_IDS` (spezifischere zuerst, ADR 0029): Fürth vor
 * Nürnberg wie im Produktivlauf, sonst nähme Nürnberg Fürther Anbieter auf (Arch-Review S2, M1).
 */
export const evalRegions = (sample: string): RegionId[] =>
  REGION_IDS.filter((r) => SAMPLE_REGIONS[sample]?.includes(r));

const SampleEntry = z.strictObject({
  id: z.string().min(1),
  /** schon in den Evals vor Plan 0050 ausgeblendet */
  alt: z.literal(true).optional(),
  notiz: z.string().min(1).optional(),
});

export const DiscoverEvalSchema = z.strictObject({
  seed: z.number().int(),
  stichproben: z.record(z.string(), z.array(SampleEntry)),
  arten: z.record(z.string(), z.enum(TRAEGER_ARTEN)),
});

/** mulberry32: kleiner, reproduzierbarer Zufall in [0, 1) */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n proportional auf die Schichten verteilt (größter Rest), nie mehr als eine Schicht hat */
export function allocate(sizes: Readonly<Record<string, number>>, n: number): Record<string, number> {
  const strata = Object.entries(sizes).sort(([a], [b]) => (a < b ? -1 : 1));
  const total = strata.reduce((s, [, size]) => s + size, 0);
  const target = Math.min(n, total);
  const out = new Map(strata.map(([k, size]) => [k, target === 0 ? 0 : Math.floor((size * target) / total)]));
  const fraction = ([k, size]: [string, number]) => (size * target) / total - (out.get(k) ?? 0);
  const byRemainder = [...strata].sort((a, b) => fraction(b) - fraction(a) || (a[0] < b[0] ? -1 : 1));
  let rest = target - [...out.values()].reduce((s, x) => s + x, 0);
  while (rest > 0) {
    for (const [k, size] of byRemainder) {
      const got = out.get(k) ?? 0;
      if (rest > 0 && got < size) {
        out.set(k, got + 1);
        rest--;
      }
    }
  }
  return Object.fromEntries(out);
}

/** n IDs geschichtet nach Art; unabhängig von der Reihenfolge des Pools (sortiert vor dem Mischen) */
export function drawStratified(pool: readonly { id: string; art: TraegerArt }[], n: number, seed: number): string[] {
  const random = seededRandom(seed);
  const strata = new Map<string, string[]>();
  for (const { id, art } of pool) strata.set(art, [...(strata.get(art) ?? []), id]);
  const counts = allocate(Object.fromEntries([...strata].map(([art, ids]) => [art, ids.length])), n);
  return [...strata.keys()].sort().flatMap((art) =>
    (strata.get(art) ?? [])
      .sort()
      .map((id) => ({ id, key: random() }))
      .sort((a, b) => a.key - b.key)
      .slice(0, counts[art] ?? 0)
      .map(({ id }) => id),
  );
}

/**
 * Stufen eines Kandidaten im Entdecken (Plan 0050, E6), in dieser Reihenfolge: von einer Quelle geliefert, durch den
 * Vorfilter, Fund-Seite abgerufen, bewertet „aufnehmen“, Orte aufgelöst (Eintrag gebaut), Ertragsbeweis bestanden.
 * Ein Kandidat trägt die letzte Stufe, die er erreicht hat. „Aufgelöst“ (Portaltreffer zur eigenen Website) kommt mit
 * der Namenssuche in S4 dazu.
 */
export const STUFEN = ["gefunden", "vorfilter", "abgerufen", "aufnehmen", "orte", "beweis"] as const;
export type Stufe = (typeof STUFEN)[number];

/** Ausgang eines ausgeblendeten Anbieters im Entdecken-Eval; `ergebnis` mit Vorrang in dieser Reihenfolge */
export interface EvalOutcome {
  id: string;
  name: string;
  /** schon in den Evals vor Plan 0050 ausgeblendet */
  alt?: true;
  ergebnis: "aufgenommen" | "verworfen" | "klärfall" | "nicht bewertet" | "vorfilter" | "nicht gefunden";
  /** weiteste Stufe über alle passenden Kandidaten; fehlt bei „nicht gefunden“ */
  stufe?: Stufe;
  /** Arten der Quellen, die ihn lieferten (`suche`, `sammelkalender`, `verzeichnis`, `klaerfall`) */
  quellen: string[];
  /** Fund-URL des passenden Kandidaten */
  url?: string;
  grund?: string;
  /** ID der zugeordneten Aufnahme */
  adoptedId?: string;
  /** Ziel 4: getroffene Termine der Referenz (Ertragsbeweis des Handeintrags im selben Lauf) */
  ertrag?: { treffer: number; referenz: number; grund?: string };
  /** zählt nicht für Ziel 4 (`coveredBy`): Das Entdecken liest nur eigene Programmseiten */
  ziel4?: false;
}

/** Ziel 4: Termine im Fenster heute bis +8 Wochen, Ort ≤ 100 m */
const YIELD_WEEKS = 8;
const YIELD_RADIUS_M = 100;

/** Fenster für Ziel 4: heute 00:00 bis heute + 8 Wochen 00:00, Berliner Kalendertage */
export const yieldWindow = (today: string): { from: string; to: string } => ({
  from: fromBerlinLocal(`${today}T00:00`),
  to: fromBerlinLocal(`${addDays(today, YIELD_WEEKS * 7)}T00:00`),
});

/** Angebot für 0–3 Jahre: ohne Altersangabe oder ab höchstens 36 Monaten (wie der Ertragsbeweis) */
export const forUnderThree = (o: { age?: { minMonths: number } | undefined }): boolean =>
  o.age === undefined || o.age.minMonths <= 36;

export interface Termin {
  start: string;
  lat: number;
  lon: number;
}

/** Termine eines Anbieters für 0–3 Jahre mit der Lage ihres Orts (wie `proveYield`: ohne Alter zählt) */
export function termineOf(
  offers: ReadonlyArray<{
    providerId: string;
    venueId: string;
    sessions: ReadonlyArray<{ start: string }>;
    age?: { minMonths: number } | undefined;
  }>,
  providerId: string,
  entry: { venues: ReadonlyArray<{ id: string; geo: { lat: number; lon: number } }> },
): Termin[] {
  return offers
    .filter((o) => o.providerId === providerId && forUnderThree(o))
    .flatMap((o) => {
      const geo = entry.venues.find((v) => v.id === o.venueId)?.geo;
      return geo ? o.sessions.map((s) => ({ start: s.start, lat: geo.lat, lon: geo.lon })) : [];
    });
}

/**
 * Ziel 4: Termine der Referenz im Fenster `[from, to)`, je einer 1:1 einem gefundenen mit gleichem Beginn und Ort
 * ≤ 100 m zugeordnet. `treffer / referenz` ist so nie über 100 %.
 */
export function matchTermine(
  found: readonly Termin[],
  reference: readonly Termin[],
  window: { from: string; to: string },
): { treffer: number; referenz: number } {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  const refs = reference.filter((r) => Date.parse(r.start) >= from && Date.parse(r.start) < to);
  const used = new Set<number>();
  let treffer = 0;
  for (const r of refs) {
    const i = found.findIndex(
      (f, j) => !used.has(j) && Date.parse(f.start) === Date.parse(r.start) && haversineMeters(f, r) <= YIELD_RADIUS_M,
    );
    if (i >= 0) {
      used.add(i);
      treffer++;
    }
  }
  return { treffer, referenz: refs.length };
}

export interface Kennzahlen {
  n: number;
  gefunden: number;
  vorfilter: number;
  abgerufen: number;
  aufnehmen: number;
  orte: number;
  wiedergefunden: number;
  /** Mittel von treffer/referenz über Anbieter mit Referenz > 0 und Ziel 4 */
  ertrag?: number;
  ertragN: number;
}

function zahlen(outcomes: readonly EvalOutcome[]): Kennzahlen {
  const reached = (s: Stufe) =>
    outcomes.filter((o) => o.stufe !== undefined && STUFEN.indexOf(o.stufe) >= STUFEN.indexOf(s)).length;
  const shares = outcomes.flatMap((o) =>
    o.ziel4 !== false && o.ertrag && o.ertrag.referenz > 0 ? [o.ertrag.treffer / o.ertrag.referenz] : [],
  );
  return {
    n: outcomes.length,
    gefunden: reached("gefunden"),
    vorfilter: reached("vorfilter"),
    abgerufen: reached("abgerufen"),
    aufnehmen: reached("aufnehmen"),
    orte: reached("orte"),
    wiedergefunden: outcomes.filter((o) => o.ergebnis === "aufgenommen").length,
    ...(shares.length > 0 ? { ertrag: shares.reduce((s, x) => s + x, 0) / shares.length } : {}),
    ertragN: shares.length,
  };
}

/** Kennzahlen je Stufe (E6), alte und neue Fälle der Stichprobe getrennt */
export function kennzahlen(outcomes: readonly EvalOutcome[]): Record<"alle" | "alt" | "neu", Kennzahlen> {
  return {
    alle: zahlen(outcomes),
    alt: zahlen(outcomes.filter((o) => o.alt)),
    neu: zahlen(outcomes.filter((o) => !o.alt)),
  };
}

/** Gefunden je Quelle: wie viele ausgeblendete Anbieter jede Art von Quelle lieferte */
export function quellenZahlen(outcomes: readonly EvalOutcome[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of outcomes) for (const q of new Set(o.quellen)) out[q] = (out[q] ?? 0) + 1;
  return out;
}

/** Ausgangswert des Evals (Plan 0050, E7): Opus high für Suche, Bewerten und Ertragsbeweis wie `discover.yml` */
const EVAL_MODEL_ENV = {
  LLM_MODEL_DISCOVER: "opus",
  LLM_EFFORT_DISCOVER: "high",
  LLM_MODEL_EXTRACT: "opus",
  LLM_MODEL_FALLBACK: "opus",
  LLM_EFFORT_EXTRACT: "high",
} as const;

/**
 * Zu setzende Umgebung für Modell und Effort. Vorrang: Option (`--model`/`--effort`, nur Suche und Bewerten) vor
 * Umgebung vor Eval-Standard; so misst ein lokaler Eval dasselbe wie Actions (Review 4, M5).
 */
export function modelEnv(
  env: Readonly<Record<string, string | undefined>>,
  o: { eval: boolean; model?: string; effort?: string },
): Record<string, string> {
  const out: Record<string, string> = {};
  if (o.eval) for (const [k, v] of Object.entries(EVAL_MODEL_ENV)) out[k] = env[k] || v;
  if (o.model) out["LLM_MODEL_DISCOVER"] = o.model;
  if (o.effort) out["LLM_EFFORT_DISCOVER"] = o.effort;
  return out;
}

/** Eigenes Laufverzeichnis je Eval: `base`, sonst `base-2`, `base-3` … */
export function freshRunDir(base: string, exists: (path: string) => boolean): string {
  if (!exists(base)) return base;
  let i = 2;
  while (exists(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Urteile von Hand über Aufnahmen ohne Gegenstück in der Stichprobe (Ziel 3), je normalisierter Fund-URL */
export const UrteileSchema = z.strictObject({
  urteile: z.record(
    z.string().min(1),
    z.strictObject({
      urteil: z.enum(["passend", "falsch", "dublette"]),
      datum: z.iso.date(),
      notiz: z.string().min(1).optional(),
    }),
  ),
});
export type Urteile = z.infer<typeof UrteileSchema>["urteile"];

type Gruppen = Record<"alle" | "alt" | "neu", Kennzahlen>;
const cellOf = (k: Gruppen, f: Exclude<keyof Kennzahlen, "ertrag" | "ertragN">) =>
  `${k.alle[f]} (${k.alt[f]}/${k.neu[f]})`;

/** Zeile der Tabelle „Entdecken“ in `evals/results.md` (Spalten siehe dort) */
export function resultsRow(r: {
  date: string;
  modelle: string;
  gueltig: boolean;
  kennzahlen: Gruppen;
  quellen: Record<string, number>;
  klaerfaelle: number;
  dubletten: number;
  falsch: number;
  unbeurteilt: number;
  neu: readonly string[];
  aufrufe: number;
  kostenUsd: number;
  dauerMin: number;
  jeAnbieter: string;
}): string {
  const k = r.kennzahlen;
  const ertrag = k.alle.ertrag === undefined ? "–" : `${Math.round(k.alle.ertrag * 100)} % (${k.alle.ertragN})`;
  const quellen =
    Object.entries(r.quellen)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([q, n]) => `${q} ${n}`)
      .join(", ") || "–";
  const cells = [
    r.date,
    r.modelle,
    r.gueltig ? "ja" : "nein",
    cellOf(k, "n"),
    cellOf(k, "gefunden"),
    String(k.alle.n - k.alle.gefunden),
    cellOf(k, "vorfilter"),
    cellOf(k, "abgerufen"),
    cellOf(k, "aufnehmen"),
    cellOf(k, "orte"),
    cellOf(k, "wiedergefunden"),
    ertrag,
    quellen,
    String(r.klaerfaelle),
    String(r.dubletten),
    `${r.falsch}${r.unbeurteilt > 0 ? ` (${r.unbeurteilt} unbeurteilt)` : ""}`,
    `${r.neu.length}${r.neu.length > 0 ? ` (${r.neu.join(", ")})` : ""}`,
    String(r.aufrufe),
    `$${r.kostenUsd.toFixed(2)}`,
    `${r.dauerMin} Min.`,
    r.jeAnbieter.replaceAll("|", "/"),
  ];
  return `| ${cells.join(" | ")} |`;
}
