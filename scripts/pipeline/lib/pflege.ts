/**
 * Pflege bekannter Anbieter (Plan 0049, E2, E4, E5), reine Logik: Vergleichsstand, simulierter Nachtlauf über den
 * Ertragsbeweis einer Kandidatenseite, Abdeckung (`coveredBy`), Ergebnis, Reihenfolge, Ruhezeit, Zustand und Bericht.
 * Erkundung und Auswahl der Kandidaten stehen in `lib/site-crawl.ts`, Abruf und Extraktion in `io/pflege.ts`.
 *
 * Neue IDs sind kein Beleg für Neues (`assignIds` vergibt im Zweifel eine neue): „neu“ heißt deshalb, dass kein
 * Angebot des Vergleichsstands mit ähnlichem Titel und passenden Terminen existiert, bewusst lockerer als die
 * Zuordnung der IDs.
 */
import { createHash } from "node:crypto";
import { haversineMeters } from "../../../src/domain/geo.ts";
import type { Anbieter, Offer, OffersFile, Provider } from "../../../src/domain/schema.ts";
import {
  addDays,
  berlinIsoDate,
  berlinKey,
  daysBetween,
  formatGermanDate,
  isoWeekday,
} from "../../../src/domain/time.ts";
import { buildFromState } from "./build-offers.ts";
import type { DiscoverState, PflegeErgebnis, Seite } from "./discover-state.ts";
import { isV2, type ProviderRaw, type UnitState } from "./raw.ts";
import { sameCoreTitle, similarTitle } from "./similar.ts";
import { unitsOf } from "./units.ts";
import { canonicalUrl, normalizeUrl } from "./url.ts";

/** Eine Einheit fällt aus dem Vergleichsstand, wenn sie seit so vielen Kalendertagen `dauerhaft` scheitert (E2, Ziel 3) */
const DURABLE_MIN_DAYS = 2;
/** Ruhezeit geprüfter Kandidaten (E4): 8 Wochen */
const REST_DAYS = 56;
/** Orte anderer Anbieter in diesem Umkreis zählen für `fremder-anbieter` (E2) */
const NEIGHBOR_RADIUS_M = 100;
/** Orts-`hint` an einer `termine`-Seite (E5): Eine neue Seite hätte ihn nicht, die Pflege berichtet nur */
const ORTS_HINT = /weglassen|nur termine an/i;
/** Ergebnisse mit Ruhezeit; `fehler` kommt im nächsten Lauf wieder, `anhaengen` steht danach im Katalog */
const RESTING: ReadonlySet<PflegeErgebnis> = new Set([
  "deckungsgleich",
  "ohne-ertrag",
  "abgeschnitten",
  "fremder-anbieter",
  "budget",
]);

type Programm = Anbieter["programme"][number];

/** Scheitert seit mindestens `DURABLE_MIN_DAYS` Kalendertagen (Europe/Berlin) dauerhaft */
const durableLong = (u: Pick<UnitState, "klasse" | "klasseSince">, today: string): boolean =>
  u.klasse === "dauerhaft" &&
  u.klasseSince !== undefined &&
  berlinIsoDate(u.klasseSince) <= addDays(today, -DURABLE_MIN_DAYS);

/**
 * Kennungen der Einheiten des Katalogeintrags, die seit mindestens zwei Kalendertagen dauerhaft scheitern, sortiert.
 * Einheiten, die der wirksame Katalog nicht nennt (`--katalog`, entfernte Seite), zählen nicht (Arch-Review S1, m4).
 */
export function durableUnitIds(provider: Anbieter, raw: ProviderRaw | undefined, today: string): string[] {
  if (!raw || !isV2(raw)) return [];
  const known = new Set(unitsOf(provider, { candidates: true, hadKandidaten: true }).map((u) => u.id));
  return Object.entries(raw.units)
    .filter(([id, u]) => known.has(id) && durableLong(u, today))
    .map(([id]) => id)
    .sort();
}

/**
 * Vergleichsstand (E2): je Anbieter des wirksamen Katalogs die Einheiten aus `data/raw`, die der Katalog nennt, samt
 * `kandidaten`; ohne Einheiten, die seit zwei Kalendertagen dauerhaft scheitern. So gilt die Ersatzseite einer
 * fehlenden Seite nicht als abgedeckt (Ziel 3), eine nur vorübergehend scheiternde bleibt im Vergleich, und eine Seite,
 * die `--katalog` entfernt, zählt nicht über ihre alten Rohdaten (Ziel 1).
 */
export function comparisonRaws(
  raws: Readonly<Record<string, ProviderRaw>>,
  catalog: readonly Provider[],
  today: string,
): Record<string, ProviderRaw> {
  const byId = new Map(catalog.map((p) => [p.id, p] as const));
  const out: Record<string, ProviderRaw> = {};
  for (const [id, raw] of Object.entries(raws)) {
    const p = byId.get(id);
    if (p?.role !== "anbieter") continue;
    if (!isV2(raw)) {
      out[id] = raw;
      continue;
    }
    const known = new Set(unitsOf(p, { candidates: true, hadKandidaten: true }).map((u) => u.id));
    const units = Object.fromEntries(
      Object.entries(raw.units).filter(([u, s]) => known.has(u) && !durableLong(s, today)),
    );
    out[id] = { ...raw, units };
  }
  return out;
}

/**
 * Stand des Vergleichs für die Ruhezeit (E4): Hash über die sortierten Kennungen der Einheiten des Anbieters laut
 * Katalog und die Kennungen mit `dauerhaft` seit zwei Tagen. Ein schwankender Bot-Schutz ändert ihn nicht.
 */
export function standOf(provider: Anbieter, raw: ProviderRaw | undefined, today: string): string {
  const units = unitsOf(provider, { candidates: false, hadKandidaten: false })
    .map((u) => u.id)
    .sort();
  const payload = JSON.stringify({ units, dauerhaft: durableUnitIds(provider, raw, today) });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/** Der volle Katalogeintrag mit dem Kandidaten als letzter Programmseite (M1: Auszug wie in der nächsten Nacht) */
export function withCandidate(provider: Anbieter, page: Programm): Anbieter {
  return { ...provider, programme: [...provider.programme, page] };
}

/**
 * Simulierter Nachtlauf (M6): `buildFromState` über den Vergleichsstand des Anbieters und seiner Nachbarn, einmal ohne
 * und einmal mit der Einheit des Kandidaten im Katalogeintrag `entry`. Angebote des Kandidaten sind die des zweiten
 * Builds mit Ursprung in seinem Batch; verglichen wird mit dem ersten. Ein Build reicht nicht: Beim Vereinigen gewinnt
 * die erste Einheit (Katalogreihenfolge, Einheiten im Fehler und `kandidaten` danach), ein Angebot, das der Kandidat
 * mit `kandidaten` teilt, hätte dort den Ursprung des Kandidaten und fehlte im Vergleich.
 */
export function simulateNight(o: {
  comparison: Readonly<Record<string, ProviderRaw>>;
  catalog: readonly Provider[];
  entry: Anbieter;
  unitId: string;
  unit: UnitState;
  previous: OffersFile | undefined;
  today: string;
  freeDays: Readonly<Record<string, string>>;
  now: string;
  /** weitere Anbieter im Build (Nachbarn für `fremder-anbieter`); Standard keiner */
  neighbors?: ReadonlySet<string>;
}): { candidate: Offer[]; own: Offer[]; neighbors: Offer[]; errors: string[] } {
  const id = o.entry.id;
  const base = o.comparison[id];
  const units = base && isV2(base) ? base.units : {};
  const others: Record<string, ProviderRaw> = {};
  for (const n of o.neighbors ?? []) {
    const r = o.comparison[n];
    if (r) others[n] = r;
  }
  const build = (raws: Record<string, ProviderRaw>, catalog: readonly Provider[]) =>
    buildFromState({
      raws,
      catalog,
      // nur die beteiligten Anbieter: wer keinen Zustand hat, behielte sonst seine Angebote aus dem Vorstand
      previous: o.previous && {
        ...o.previous,
        offers: o.previous.offers.filter((x) => raws[x.providerId] !== undefined),
      },
      today: o.today,
      freeDays: o.freeDays,
      generatedAt: o.now,
      sources: {},
    });
  const before = build({ ...others, [id]: { version: 2, units } }, o.catalog);
  const after = build(
    { ...others, [id]: { version: 2, units: { ...units, [o.unitId]: o.unit } } },
    o.catalog.map((p) => (p.id === id ? o.entry : p)),
  );
  const isCandidate = (x: Offer) => {
    const batch = after.report.origins[x.id];
    return batch !== undefined && batch.startsWith(`${id}#`) && after.unitOf[batch] === o.unitId;
  };
  const existing = before.file?.offers ?? [];
  return {
    candidate: (after.file?.offers ?? []).filter((x) => x.providerId === id && isCandidate(x)),
    own: existing.filter((x) => x.providerId === id),
    neighbors: existing.filter((x) => x.providerId !== id),
    errors: [...before.report.errors, ...after.report.errors],
  };
}

const futureStarts = (o: Offer, today: string) => o.sessions.filter((s) => berlinIsoDate(s.start) >= today);
/** Wochentag und Uhrzeit (Europe/Berlin), etwa „3 10:00“ */
const slot = (start: string) => `${isoWeekday(berlinIsoDate(start))} ${berlinKey(start).slice(11, 16)}`;

/**
 * Abgedeckt (E2): ein Angebot aus `pool` mit ähnlichem Kerntitel (`sameCoreTitle` oder `similarTitle`) und gleichem
 * erstem künftigem Beginn, mindestens 50 % gleichen künftigen Beginnzeiten oder gleichem Wochentag und gleicher
 * Uhrzeit des ersten künftigen Termins. Der Aufrufer wählt den Pool (eigener Anbieter bzw. Nachbarn).
 */
export function coveredBy(offer: Offer, pool: readonly Offer[], today: string): Offer | undefined {
  const mine = futureStarts(offer, today);
  const first = mine[0];
  if (!first) return undefined;
  const starts = mine.map((s) => Date.parse(s.start));
  return pool.find((other) => {
    if (!sameCoreTitle(offer.title, other.title) && !similarTitle(offer.title, other.title)) return false;
    const theirs = futureStarts(other, today);
    const theirFirst = theirs[0];
    if (!theirFirst) return false;
    if (Date.parse(theirFirst.start) === starts[0]) return true;
    const set = new Set(theirs.map((s) => Date.parse(s.start)));
    if (starts.filter((t) => set.has(t)).length * 2 >= starts.length) return true;
    return theirs.some((s) => slot(s.start) === slot(first.start));
  });
}

export interface Verdict {
  ergebnis: Extract<PflegeErgebnis, "anhaengen" | "deckungsgleich" | "fremder-anbieter" | "ohne-ertrag">;
  grund?: string;
  /** neue Angebote (nicht abgedeckt, künftiger Termin, ab höchstens 36 Monaten) */
  neu: Offer[];
  /** beim Nachbarn abgedeckte Angebote */
  fremd: Array<{ offer: Offer; by: Offer }>;
}

/**
 * Ergebnis des Ertragsbeweises (E2). `relevant` ist `isRelevant` über den Text der Einheit. Neue Angebote neben
 * fremden ergeben `anhaengen`; nur fremde `fremder-anbieter` (sonst stünde dasselbe Angebot unter zwei Anbietern).
 */
export function judgeProof(o: {
  candidate: readonly Offer[];
  own: readonly Offer[];
  neighbors: readonly Offer[];
  relevant: boolean;
  today: string;
  /**
   * Die Extraktion des Kandidaten fand künftige Termine (`status: ok`). Ohne eigene Angebote heißt das: Der Build hat
   * alle mit bestehenden Seiten vereinigt, der Kandidat ist deckungsgleich, nicht ohne Ertrag.
   */
  extracted?: boolean;
}): Verdict {
  const valid = o.candidate.filter((x) => futureStarts(x, o.today).length > 0 && (x.age?.minMonths ?? 0) <= 36);
  if (valid.length === 0 && o.candidate.length === 0 && o.extracted)
    return { ergebnis: "deckungsgleich", grund: "mit bestehenden Seiten vereinigt", neu: [], fremd: [] };
  if (valid.length === 0)
    return { ergebnis: "ohne-ertrag", grund: "kein Angebot mit künftigem Termin", neu: [], fremd: [] };
  const open = valid.filter((x) => !coveredBy(x, o.own, o.today));
  if (open.length === 0) return { ergebnis: "deckungsgleich", neu: [], fremd: [] };
  const fremd: Verdict["fremd"] = [];
  const neu: Offer[] = [];
  for (const x of open) {
    const by = coveredBy(x, o.neighbors, o.today);
    if (by) fremd.push({ offer: x, by });
    else neu.push(x);
  }
  if (neu.length > 0)
    return o.relevant
      ? { ergebnis: "anhaengen", neu, fremd }
      : { ergebnis: "ohne-ertrag", grund: "kein Kleinkindbezug im Text", neu: [], fremd };
  return { ergebnis: "fremder-anbieter", grund: `abgedeckt bei ${fremd[0]?.by.providerId}`, neu: [], fremd };
}

/** Andere Anbieter mit einem Ort in höchstens `NEIGHBOR_RADIUS_M` (E2, `fremder-anbieter`) */
export function neighborIds(provider: Anbieter, catalog: readonly Provider[]): Set<string> {
  const out = new Set<string>();
  for (const p of catalog) {
    if (p.id === provider.id || p.role !== "anbieter") continue;
    if (p.venues.some((v) => provider.venues.some((w) => haversineMeters(v.geo, w.geo) <= NEIGHBOR_RADIUS_M)))
      out.add(p.id);
  }
  return out;
}

/** Orts-`hint` an einer `termine`-Seite (E5): Kandidaten nur im Bericht */
export const ortsHint = (provider: Anbieter): boolean =>
  provider.programme.some((g) => g.use === "termine" && g.hint !== undefined && ORTS_HINT.test(g.hint));

/**
 * Hinweise (`hint`) an den Terminseiten des Anbieters (S1-Messung): Sie gelten nur für ihre Seite. Eine neue Seite
 * hätte sie nicht (etwa „nur Kurse mit Baby; Rückbildung ist ohne Kind“), deshalb nennt der Bericht sie bei jedem
 * „würde anhängen“ für die Abnahme je Seite (Ziel 2).
 */
export const termineHints = (provider: Anbieter): string[] => [
  ...new Set(provider.programme.flatMap((g) => (g.use === "termine" && g.hint ? [g.hint] : []))),
];

const FOLLOW_LABEL = /^\s*(weiter\b|nächste\b|naechste\b|mehr termine|ältere\b|›|»|>)/i;
const FOLLOW_URL = /[?&](page|seite|p|pg)=2\b|\/(page|seite)\/2\b/i;
/** Hinweis „Liste blättert“ (Nicht-Ziele): ein Folgelink auf der Kandidatenseite; `follow` selbst erst mit Plan 0042 */
export const listPages = (links: ReadonlyArray<{ label: string; url: string }>): boolean =>
  links.some((l) => FOLLOW_LABEL.test(l.label) || FOLLOW_URL.test(l.url));

/**
 * Reihenfolge des Pflegelaufs (E5): Anbieter mit einer Einheit `dauerhaft` seit zwei Kalendertagen zuerst, dann nach
 * dem letzten Pflegelauf (nie gepflegt ganz vorn), bei Gleichstand nach ID. So verhungert keiner.
 */
export function careOrder(
  providers: ReadonlyArray<{ id: string; durable: boolean }>,
  gepflegt: ReadonlyArray<{ anbieter: string; datum: string }>,
): string[] {
  const last = new Map(gepflegt.map((g) => [g.anbieter, g.datum] as const));
  return [...providers]
    .sort(
      (a, b) =>
        Number(b.durable) - Number(a.durable) ||
        (last.get(a.id) ?? "").localeCompare(last.get(b.id) ?? "") ||
        a.id.localeCompare(b.id),
    )
    .map((p) => p.id);
}

/**
 * Ruht der Kandidat (E4)? 8 Wochen nach einem Ergebnis mit Ruhezeit, außer der Stand hat sich geändert oder der
 * Anbieter steht in Gruppe 1 (Ersatz nach einem Relaunch, Ziel 3). `fehler` kommt im nächsten Lauf wieder.
 */
export function inRest(seite: Seite | undefined, o: { stand: string; durable: boolean; today: string }): boolean {
  if (!seite || o.durable || seite.stand !== o.stand || !RESTING.has(seite.ergebnis)) return false;
  return daysBetween(seite.geprueft, o.today) < REST_DAYS;
}

const keyOf = (url: string) => normalizeUrl(canonicalUrl(url) ?? url) ?? url;

/** Vergleichsschlüssel einer Kandidaten-URL im Zustand */
export const seiteKey = keyOf;

/**
 * Abgelehnte URLs (E4) über die Zustände aller Regionen: eine abgelehnte Seite oder ein abgelehnter Anbieter mit URL.
 * Hosts sperren nur im Entdecken (Vermittler), eine Programmseite auf einem solchen Host gehört schon einem Anbieter.
 */
export function rejectedUrls(states: ReadonlyArray<Pick<DiscoverState, "abgelehnt">>): (url: string) => boolean {
  const set = new Set(states.flatMap((s) => s.abgelehnt.flatMap((a) => (a.url ? [keyOf(a.url)] : []))));
  return (url) => set.has(keyOf(url));
}

/**
 * Nächster Zustand (E4): Geprüfte Seiten ersetzen ihre alten Einträge; Einträge mit abgelaufener Ruhezeit, die der
 * Lauf bei einem gepflegten Anbieter nicht mehr sah, entfallen. `gepflegt` bekommt das Datum für jeden gepflegten
 * Anbieter, auch ohne Kandidaten.
 */
export function nextState<S extends { seiten: Seite[]; gepflegt: Array<{ anbieter: string; datum: string }> }>(
  state: S,
  run: {
    cared: readonly string[];
    checked: readonly Seite[];
    /** je gepflegtem Anbieter die URLs der Kandidaten, die der Lauf sah (auch ruhende) */
    seen: ReadonlyMap<string, ReadonlySet<string>>;
    today: string;
  },
): S {
  const cared = new Set(run.cared);
  const checked = new Map(run.checked.map((s) => [keyOf(s.url), s] as const));
  const seen = new Map([...run.seen].map(([id, urls]) => [id, new Set([...urls].map(keyOf))] as const));
  const kept = state.seiten.filter((s) => {
    const k = keyOf(s.url);
    if (checked.has(k)) return false;
    if (!cared.has(s.anbieter)) return true;
    return seen.get(s.anbieter)?.has(k) === true || daysBetween(s.geprueft, run.today) < REST_DAYS;
  });
  const gepflegt = [
    ...state.gepflegt.filter((g) => !cared.has(g.anbieter)),
    ...run.cared.map((anbieter) => ({ anbieter, datum: run.today })),
  ].sort((a, b) => a.anbieter.localeCompare(b.anbieter));
  return {
    ...state,
    seiten: [...kept, ...checked.values()].sort((a, b) => keyOf(a.url).localeCompare(keyOf(b.url))),
    gepflegt,
  };
}

/** Ergebnis je Kandidat im Bericht: ein Beweis oder ein Grund, warum keiner lief */
type ReportErgebnis = PflegeErgebnis | "ruhe";

export interface ReportCandidate {
  url: string;
  kind: string;
  browser: boolean;
  future: number;
  ergebnis: ReportErgebnis;
  grund?: string;
  neu: ReadonlyArray<{ title: string; first: string }>;
  hinweise: readonly string[];
}

export interface ReportRow {
  id: string;
  fetches: number;
  gesperrt: readonly string[];
  kandidaten: readonly ReportCandidate[];
  /** Seiten, die seit zwei Tagen dauerhaft scheitern (Ersatz gesucht) */
  ersatzFuer?: readonly string[];
  /** Grund, warum der Anbieter nur berichtet wird (Orts-`hint`) */
  nurBericht?: string | undefined;
  /** Fehler der Erkundung selbst */
  fehler?: string;
}

/** Fremder Text im Bericht: einzeilig, `@` entschärft (Webtext soll im Issue niemanden erwähnen), gekürzt */
function clean(s: string, max = 120): string {
  const t = s.replace(/\s*[\r\n]+\s*/g, " ").replaceAll("@", "(at)");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** Bericht des Pflegelaufs (E5): je Anbieter Seiten, Kandidaten und Ergebnis, Hinweise, die Liste „würde anhängen“, Summen */
export function pflegeReport(r: {
  date: string;
  modus: "trocken" | "live";
  modell: string;
  dauerMin: number;
  abort: string | undefined;
  kosten: string;
  rows: readonly ReportRow[];
}): string {
  const all = r.rows.flatMap((row) => row.kandidaten.map((k) => ({ row, k })));
  const append = all.filter(({ row, k }) => k.ergebnis === "anhaengen" && !row.nurBericht);
  const reported = all.filter(({ row, k }) => k.ergebnis === "anhaengen" && row.nurBericht);
  const count = (e: ReportErgebnis) => all.filter(({ k }) => k.ergebnis === e).length;
  const ergebnisse: ReportErgebnis[] = [
    "anhaengen",
    "deckungsgleich",
    "fremder-anbieter",
    "ohne-ertrag",
    "abgeschnitten",
    "fehler",
    "ruhe",
  ];
  const first = (k: ReportCandidate) =>
    k.neu[0]
      ? `; neu: ${k.neu.map((n) => `„${clean(n.title, 80)}“ ab ${formatGermanDate(berlinIsoDate(n.first))}`).join(", ")}`
      : "";
  const lines = [
    `# Pflege ${r.date} (${r.modus})`,
    "",
    `- Modell ${r.modell}; ${r.rows.length} Anbieter, ${r.rows.reduce((n, x) => n + x.fetches, 0)} Abrufe, ${r.dauerMin} Min.`,
    `- Kandidaten ${all.length}: ${ergebnisse.map((e) => `${e} ${count(e)}`).join(", ")}`,
    `- Kosten: ${r.kosten}`,
    ...(r.abort ? [`- **Vorzeitig beendet:** ${r.abort}`] : []),
    "",
    `## ${r.modus === "trocken" ? "Würde anhängen" : "Angehängt"} (${append.length})`,
    "",
    ...(append.length === 0
      ? ["keine"]
      : append.map(({ row, k }) => `- ${row.id}: ${k.url} (${k.kind}${k.browser ? ", Browser" : ""})${first(k)}`)),
    ...(reported.length > 0
      ? [
          "",
          `## Nur berichtet (${reported.length})`,
          "",
          ...reported.map(({ row, k }) => `- ${row.id}: ${k.url} – ${row.nurBericht}${first(k)}`),
        ]
      : []),
    "",
    "## Je Anbieter",
    "",
  ];
  for (const row of r.rows) {
    lines.push(`### ${row.id}: ${row.fetches} Abrufe, ${row.kandidaten.length} Kandidaten`, "");
    if (row.fehler) lines.push(`- Fehler: ${clean(row.fehler)}`);
    if (row.nurBericht) lines.push(`- nur berichtet: ${row.nurBericht}`);
    for (const u of row.ersatzFuer ?? []) lines.push(`- Ersatz für ${u} gesucht (dauerhaft seit zwei Tagen)`);
    for (const u of row.gesperrt) lines.push(`- robots.txt gesperrt: ${u}`);
    for (const k of row.kandidaten) {
      const notes = [...(k.grund ? [clean(k.grund)] : []), ...k.hinweise].join("; ");
      lines.push(
        `- ${k.ergebnis}: ${k.url} (${k.kind}${k.browser ? ", Browser" : ""}, ${k.future} künftig)${notes ? ` – ${notes}` : ""}${first(k)}`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
