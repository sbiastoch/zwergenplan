/**
 * Bericht des Nachtlaufs (Plan 0032, E6/E10), reine Logik: Form von `runs/<datum>/nightly.json`, Ampel nach E6,
 * Live-Stand gegen `main`, Markdown für `pnpm pipeline status` und `$GITHUB_STEP_SUMMARY`, Commit-Text von
 * `pipeline publish`.
 */
import { z } from "zod";
import { berlinIsoDate, formatGermanDate } from "../../../src/domain/time.ts";
import { type CostSummary, summarizeCosts } from "./cost.ts";
import { CALL_STEPS, type CallRecord } from "./extract.ts";
import { CATEGORY_CONFLICT, type ProviderRaw, providerStatus, rawEvents, unitStates } from "./raw.ts";
import type { ProviderResult } from "./refresh.ts";

const REFRESH_RESULTS = [
  "unveraendert",
  "pending-uebernommen",
  "gehalten",
  "gehalten-uebernommen",
  "ausgefallen",
  "entfernt",
  "extrahiert",
  "einbruch",
  "leer",
  "fehler",
  "teilausfall",
  "umstellung-ausstehend",
  "offen",
] as const satisfies readonly ProviderResult[];

/**
 * Ergebnis je Anbieter: Regel aus E5 oder nicht bearbeitet (`offen`), abgebrochen, Auslöser des Abbruchs. Fehlt hier
 * eine Regel aus lib/refresh.ts, wird `runNightly` beim Typprüfen rot (Zuweisung von `RefreshResult`).
 */
export const ProviderState = z.enum([...REFRESH_RESULTS, "abgebrochen", "abort"]);
export type ProviderState = z.infer<typeof ProviderState>;

/** `CallRecord` (lib/extract.ts) beim Lesen von nightly.json; `part` nur, wenn gesetzt */
const CallRecordSchema = z
  .object({
    step: z.enum(CALL_STEPS),
    providerId: z.string(),
    part: z.string().optional(),
    unit: z.string().optional(),
    model: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadTokens: z.number(),
    cacheCreationTokens: z.number(),
    webSearchRequests: z.number(),
    turns: z.number(),
    durationMs: z.number(),
    costUsd: z.number().nullable(),
    result: z.enum(["ok", "invalid", "truncated", "abort", "error"]),
  })
  .transform(
    ({ part, unit, ...rest }): CallRecord => ({
      ...rest,
      ...(part === undefined ? {} : { part }),
      ...(unit === undefined ? {} : { unit }),
    }),
  );

const AdapterSummary = z.object({
  status: z.enum(["ok", "fehler"]),
  reason: z.string().optional(),
  candidates: z.number(),
  matched: z.number(),
  warnings: z.array(z.string()),
});

/** `runs/<datum>/nightly.json`, geschrieben von `runNightly` (io/nightly.ts), gelesen von `pipeline status`. */
export const NightlyReport = z.object({
  date: z.string(),
  durationMs: z.number(),
  results: z.record(z.string(), ProviderState),
  /** Ergebnis je Einheit (Plan 0048, E5); fehlt in älteren Berichten */
  units: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  /** Anbieter mit ausstehender Umstellung und Grund (E7); fehlt in älteren Berichten */
  migrations: z.record(z.string(), z.string()).optional(),
  /** Einheiten mit Lücke gegen den Vorzustand je Anbieter (Plan 0048, E13); fehlt in älteren Berichten */
  gaps: z
    .record(
      z.string(),
      z.record(
        z.string(),
        z.object({ before: z.number(), after: z.number().optional(), chosen: z.enum(["first", "second"]).optional() }),
      ),
    )
    .optional(),
  calls: z.array(CallRecordSchema),
  /** Hinweise der Prüfung je Anbieter mit neuer Antwort (`validateRaw`, Teile), nur Anbieter mit Hinweisen */
  warnings: z.record(z.string(), z.array(z.string())),
  /** durch den Cache gesparte Aufrufe (E8) */
  cached: z.number(),
  abort: z.enum(["auth", "limit"]).optional(),
  budgetHit: z.boolean(),
  /** erreichte Bremse (E8) */
  brake: z.enum(["aufrufe", "tokens"]).optional(),
  /** Zustand von Anbietern, die nicht mehr im Katalog stehen (gelöscht, im Trockenlauf nur gemeldet) */
  removed: z.array(z.string()),
  adapters: z.record(z.string(), AdapterSummary),
  build: z.object({
    offers: z.number(),
    sessions: z.number(),
    errors: z.array(z.string()),
    notes: z.array(z.string()),
    written: z.string().optional(),
    /** Angebote mit aus den Themen abgeleiteter Kategorie (Übergang Plan 0037, E5); fehlt in älteren Berichten */
    derivedCategories: z.number().optional(),
  }),
  /** Vorstand `data/offers.json` vor dem Lauf; fehlt ohne Vorstand */
  previous: z.object({ offers: z.number(), sessions: z.number() }).optional(),
});
export type NightlyReport = z.infer<typeof NightlyReport>;

/** Ergebnisse, die zählen, wenn mehr als 20 % der Anbieter scheitern (E6). Ein zurückgehaltener Einbruch nicht. */
const FAILED: ReadonlySet<ProviderState> = new Set<ProviderState>(["fehler", "ausgefallen"]);
/** Anbieter mit neuem Stand (Spalte `geaenderte_anbieter`) */
const CHANGED: ReadonlySet<ProviderState> = new Set<ProviderState>([
  "extrahiert",
  "pending-uebernommen",
  "gehalten-uebernommen",
]);
const UNDONE: ReadonlySet<ProviderState> = new Set<ProviderState>(["offen", "abgebrochen", "abort"]);
const MAX_FAILED_SHARE = 0.2;
/**
 * „Live-Stand mehr als einen Tag hinter main“ (E6), gemessen im nächsten Nachtlauf: Der Daten-Commit der Vornacht ist
 * dann rund 24 Std. alt. Mit 20 Std. meldet schon die nächste Nacht rot, wenn er nicht live ging (Arch-Review S3).
 */
const MAX_LIVE_LAG_HOURS = 20;

export function changedProviders(r: NightlyReport): number {
  return Object.values(r.results).filter((s) => CHANGED.has(s)).length;
}

const countOf = (r: NightlyReport, set: ReadonlySet<ProviderState>) =>
  Object.values(r.results).filter((s) => set.has(s)).length;

export type LiveStatus =
  | { kind: "aktuell"; commit: string }
  | { kind: "hinter"; commit: string; head: string; hours: number; commits: number }
  | { kind: "unbekannt"; reason: string };

/**
 * Live-Stand gegen `main` (E6). `missing` sind die Commits auf `main` nach dem live ausgelieferten, neueste zuerst
 * (`undefined`: der Live-Commit liegt nicht in `main`). Commits nur mit Doku zählen nicht: Der Doku-Pfad deployt nicht
 * (ADR 0021, Teil B), `meta.json` zeigt dann weiter den letzten ausgelieferten Commit.
 */
export function liveLag(i: {
  liveCommit: string | undefined;
  head: string;
  missing: ReadonlyArray<{ sha: string; at: string; docOnly: boolean }> | undefined;
  now: Date;
  reason?: string;
}): LiveStatus {
  if (!i.liveCommit) return { kind: "unbekannt", reason: i.reason ?? "kein Live-Commit" };
  if (i.head.startsWith(i.liveCommit)) return { kind: "aktuell", commit: i.liveCommit };
  if (!i.missing) return { kind: "unbekannt", reason: `Live-Commit ${i.liveCommit} liegt nicht in main` };
  const code = i.missing.filter((c) => !c.docOnly);
  const oldest = code.at(-1);
  if (!oldest) return { kind: "aktuell", commit: i.liveCommit };
  return {
    kind: "hinter",
    commit: i.liveCommit,
    head: i.head.slice(0, 7),
    hours: Math.floor((i.now.getTime() - Date.parse(oldest.at)) / 3_600_000),
    commits: code.length,
  };
}

/**
 * Ausgabe von `log --format=%x00%H%x09%cI --name-only` (neueste zuerst) als Liste. Commits ohne Dateien (etwa
 * Merges) haben eine leere Liste.
 */
export function parseCommitLog(text: string): Array<{ sha: string; at: string; files: string[] }> {
  return text
    .split("\u0000")
    .filter((chunk) => chunk.trim() !== "")
    .map((chunk) => {
      const [head = "", ...rest] = chunk.split("\n");
      const [sha = "", at = ""] = head.split("\t");
      return { sha, at, files: rest.map((l) => l.trim()).filter(Boolean) };
    });
}

/** Ausgang eines Workflow-Schritts (`steps.<id>.outcome`); fehlt lokal */
export type StepOutcome = "success" | "failure" | "cancelled" | "skipped";

export interface Verdict {
  light: "gruen" | "gelb" | "rot";
  red: string[];
  yellow: string[];
}

/** Ampel nach E6. Rot: Abbruch, Bremse, Zeitbudget, Build, > 20 % fehler, Gates, Push, Live-Stand > 1 Tag hinter. */
export function assessRun(
  r: NightlyReport | undefined,
  ctx: { live: LiveStatus; gates?: StepOutcome; push?: StepOutcome },
): Verdict {
  const red: string[] = [];
  const yellow: string[] = [];
  if (!r) red.push("kein Bericht (nightly.json fehlt)");
  else {
    if (r.abort) red.push(`Abbruch: ${r.abort} (Auth oder Nutzungslimit)`);
    if (r.brake) red.push(`Bremse erreicht: ${r.brake} (E8)`);
    if (r.budgetHit) red.push("Zeitbudget erreicht (RUN_BUDGET_MIN)");
    if (!r.build.written) red.push(`Build abgebrochen: ${r.build.errors.join("; ")}`);
    const total = Object.keys(r.results).length;
    const failed = countOf(r, FAILED);
    if (total > 0 && failed / total > MAX_FAILED_SHARE)
      red.push(
        `${failed} von ${total} Anbietern mit Fehler (${Math.round((failed / total) * 100)} %, Grenze ${MAX_FAILED_SHARE * 100} %)`,
      );
    else if (failed > 0) yellow.push(`${failed} Anbieter mit Fehler`);
    // einzelne Seiten im Fehler zählen nicht zur 20-%-Regel (Plan 0048, E10)
    const partial = countOf(r, new Set<ProviderState>(["teilausfall"]));
    if (partial > 0) yellow.push(`${partial} Anbieter mit einzelnen Seiten im Fehler`);
    const pendingMigration = countOf(r, new Set<ProviderState>(["umstellung-ausstehend"]));
    if (pendingMigration > 0) yellow.push(`${pendingMigration} Anbieter noch nicht umgestellt (Plan 0048, E7)`);
    const collapses = countOf(r, new Set<ProviderState>(["einbruch"]));
    if (collapses > 0) yellow.push(`${collapses} ${collapses === 1 ? "Einbruch" : "Einbrüche"} zurückgehalten`);
    const undone = countOf(r, UNDONE);
    if (undone > 0) yellow.push(`${undone} Anbieter nicht bearbeitet (offen oder abgebrochen)`);
  }
  if (ctx.gates === "failure" || ctx.gates === "cancelled") red.push("Gates rot (data:validate, check:fast)");
  if (ctx.push === "failure" || ctx.push === "cancelled") red.push("Push gescheitert (Konflikt oder Prüfung)");
  if (ctx.live.kind === "hinter" && ctx.live.hours >= MAX_LIVE_LAG_HOURS)
    red.push(`Live-Stand ${ctx.live.hours} Std. hinter main (${ctx.live.commit} → ${ctx.live.head})`);
  if (ctx.live.kind === "unbekannt") yellow.push(`Live-Stand unbekannt: ${ctx.live.reason}`);
  return { light: red.length > 0 ? "rot" : yellow.length > 0 ? "gelb" : "gruen", red, yellow };
}

const de = (n: number) => n.toLocaleString("de-DE");
const signed = (n: number) => (n > 0 ? `+${de(n)}` : de(n));
const usd = (n: number) => `$${n.toFixed(4)}`;
const cell = (s: string) => s.replaceAll("|", "/").replaceAll("\n", " ").slice(0, 200);
const day = (instant: string | undefined) => (instant ? formatGermanDate(berlinIsoDate(instant)) : "–");
const COST_LABEL = "Schätzung API-Gegenwert, nicht Abo-Preis";

function liveLine(live: LiveStatus): string {
  if (live.kind === "aktuell") return `Live-Stand: aktuell (${live.commit})`;
  if (live.kind === "hinter")
    return `Live-Stand: ${live.commit}, main ${live.head}, ${live.commits} Commit(s) mit Code seit ${live.hours} Std. nicht live`;
  return `Live-Stand: unbekannt (${live.reason})`;
}

/** Kostenabschnitt des Berichts (E8); `results` = Ergebnis je Anbieter bzw. Kandidat (auch für das Entdecken) */
export function costSection(c: CostSummary, results: Readonly<Record<string, string>>): string[] {
  const out = [
    `## Kosten (${COST_LABEL})`,
    "",
    `- Modellaufrufe: ${c.total.calls}, durch den Cache gespart: ${c.cachedCalls}`,
    `- Tokens ein ${de(c.total.tokensIn)} (davon Cache lesen ${de(c.total.cacheRead)}, schreiben ${de(c.total.cacheWrite)}), aus ${de(c.total.tokensOut)}`,
    `- Summe ${usd(c.total.costUsd)}, je extrahiertem Anbieter ${usd(c.perProviderUsd)} (${c.providers.length} Anbieter)`,
  ];
  if (c.byStepModel.length > 0) {
    out.push("", "| Schritt | Modell | Aufrufe | Tokens ein | Tokens aus | USD |", "|---|---|---|---|---|---|");
    for (const s of c.byStepModel)
      out.push(`| ${s.step} | ${s.model} | ${s.calls} | ${de(s.tokensIn)} | ${de(s.tokensOut)} | ${usd(s.costUsd)} |`);
  }
  const top = c.providers.slice(0, 10);
  if (top.length > 0) {
    // Ergebnis zeigt teure Nächte ohne Ertrag (etwa fehler erst in der gemeinsamen Prüfung der Teile, Stufe 2)
    out.push(
      "",
      "| Anbieter (teuerste 10) | Aufrufe | davon ohne gültige Antwort | Ergebnis | USD |",
      "|---|---|---|---|---|",
    );
    for (const p of top)
      out.push(`| ${p.providerId} | ${p.calls} | ${p.failed} | ${results[p.providerId] ?? "–"} | ${usd(p.costUsd)} |`);
  }
  return out;
}

/**
 * Zeilen zum Übergang auf `category` (Plan 0037, E2, E5), je nur bei N > 0: abgeleitete Kategorien im Build und
 * Widersprüche zu den Themen in den Events der frisch extrahierten Anbieter. Ohne Einfluss auf die Ampel.
 */
function categoryLines(r: NightlyReport, raws: Readonly<Record<string, ProviderRaw>>): string[] {
  const out: string[] = [];
  const derived = r.build.derivedCategories ?? 0;
  if (derived > 0) out.push(`Kategorie aus Themen abgeleitet: ${de(derived)} Angebote (Übergang Plan 0037)`);
  // Nur frisch extrahierte Anbieter: `pending-uebernommen` läuft ohne Modellaufruf und ohne Warnungen und würde den
  // Nenner nur aufblähen.
  const adopted = Object.keys(r.results).filter((id) => r.results[id] === "extrahiert");
  const conflicts = adopted.reduce(
    (n, id) => n + (r.warnings[id] ?? []).filter((w) => w.includes(CATEGORY_CONFLICT)).length,
    0,
  );
  const events = adopted.reduce((n, id) => n + (raws[id] ? rawEvents(raws[id]).length : 0), 0);
  if (conflicts > 0)
    out.push(
      `Kategorie passt zu keinem Thema: ${de(conflicts)} von ${de(events)} neuen Events (${Math.round((conflicts / Math.max(events, 1)) * 100)} %)`,
    );
  return out;
}

export interface StatusInput {
  report: NightlyReport | undefined;
  verdict: Verdict;
  live: LiveStatus;
  /** Zustand je Anbieter nach dem Lauf (data/raw, im Trockenlauf überlagert von runs/<datum>/raw) */
  raws: Readonly<Record<string, ProviderRaw>>;
  /** Angebote je Anbieter im geschriebenen Stand (für zurückgehaltene Einbrüche) */
  stock: Readonly<Record<string, number>>;
  /** `runs/<datum>/fetch/report.md` */
  fetchReport?: string;
}

/** Zeile zu den Lücken (E13), leer ohne Lücken; die Zahl ist eine Obergrenze echter Lücken (Titelwechsel zählen mit). */
function gapLines(r: NightlyReport): string[] {
  const all = Object.values(r.gaps ?? {}).flatMap((u) => Object.values(u));
  if (all.length === 0) return [];
  const closed = all.filter((g) => g.chosen === "second" && g.after === 0).length;
  return [`- Lücken gegen die Vornacht (E13): ${all.length} Einheiten, ${closed} im zweiten Versuch geschlossen`, ""];
}

/** Markdown für `pnpm pipeline status` und `$GITHUB_STEP_SUMMARY` (E10). */
export function renderStatus(s: StatusInput): string {
  const r = s.report;
  const out = [`# Nachtlauf ${r?.date ?? ""} – Ampel: ${s.verdict.light}`.replace("  ", " "), ""];
  for (const reason of s.verdict.red) out.push(`- **rot:** ${reason}`);
  for (const reason of s.verdict.yellow) out.push(`- ${reason}`);
  if (s.verdict.red.length + s.verdict.yellow.length > 0) out.push("");
  out.push(`- ${liveLine(s.live)}`);
  if (!r) return `${out.join("\n")}\n`;
  const counts = new Map<string, number>();
  for (const st of Object.values(r.results)) counts.set(st, (counts.get(st) ?? 0) + 1);
  out.push(
    `- Dauer ${Math.round(r.durationMs / 60_000)} Min., Anbieter ${Object.keys(r.results).length}: ` +
      [...counts]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, n]) => `${k} ${n}`)
        .join(", "),
    "",
    ...gapLines(r),
    "| | Vorstand | neu | Differenz |",
    "|---|---|---|---|",
  );
  const prev = r.previous;
  out.push(
    `| Angebote | ${prev ? de(prev.offers) : "–"} | ${de(r.build.offers)} | ${prev ? signed(r.build.offers - prev.offers) : "–"} |`,
    `| Termine | ${prev ? de(prev.sessions) : "–"} | ${de(r.build.sessions)} | ${prev ? signed(r.build.sessions - prev.sessions) : "–"} |`,
  );
  const transition = categoryLines(r, s.raws);
  if (transition.length > 0) out.push("", ...transition.map((l) => `- ${l}`));
  if (r.build.errors.length > 0) out.push("", "**Build-Fehler:**", ...r.build.errors.map((e) => `- ${e}`));

  // je Einheit (Plan 0048): eine ausgefallene Seite steht mit ihrer Kennung da
  const label = (id: string, unit: string) => (unit === "" ? id : `${id} ${unit}`);
  const failing = Object.entries(s.raws).flatMap(([id, raw]) =>
    unitStates(raw)
      .filter(([, u]) => u.status === "fehler")
      .map(([unit, u]) => `| ${cell(label(id, unit))} | ${cell(u.reason ?? "")} | ${day(u.failingSince)} |`),
  );
  const adapterFailures = Object.entries(r.adapters)
    .filter(([, a]) => a.status === "fehler")
    .map(([name, a]) => `| ${name} (Sammelkalender) | ${cell(a.reason ?? "")} | – |`);
  if (failing.length + adapterFailures.length > 0)
    out.push(
      "",
      "## Quellen mit Fehler",
      "",
      "| Quelle | Grund | seit |",
      "|---|---|---|",
      ...failing,
      ...adapterFailures,
    );

  const pending = Object.entries(s.raws).flatMap(([id, raw]) =>
    unitStates(raw).flatMap(([unit, u]) => (u.pending ? [{ id, unit, u, pending: u.pending }] : [])),
  );
  if (pending.length > 0) {
    out.push("", "## Zurückgehaltene Einbrüche (E5)", "", "| Anbieter | Bestand | neu |", "|---|---|---|");
    for (const p of pending)
      out.push(
        `| ${cell(label(p.id, p.unit))} | ${p.unit === "" ? (s.stock[p.id] ?? 0) : p.u.events.length} | ${p.pending.events.length} |`,
      );
  }
  if (r.removed.length > 0) out.push("", `Zustand entfernt (nicht mehr im Katalog): ${r.removed.join(", ")}`);

  const warned = Object.entries(r.warnings);
  if (warned.length > 0) {
    out.push("", `<details><summary>Warnungen (${warned.length} Anbieter)</summary>`, "");
    for (const [id, list] of warned) for (const w of list) out.push(`- ${id}: ${cell(w)}`);
    out.push("", "</details>");
  }
  out.push("", ...costSection(summarizeCosts(r.calls, { cached: r.cached }), r.results));
  if (s.fetchReport) out.push("", "<details><summary>Abruf</summary>", "", s.fetchReport.trim(), "", "</details>");
  return `${out.join("\n")}\n`;
}

/** Commit-Text von `pipeline publish` nach dem Nachtlauf: Betreff mit Zahlen, Text mit Kurzbericht. */
export function nightlyCommitMessage(r: NightlyReport, raws: Readonly<Record<string, ProviderRaw>>): string {
  const changed = changedProviders(r);
  const c = summarizeCosts(r.calls, { cached: r.cached });
  const counts = new Map<string, number>();
  for (const st of Object.values(r.results)) counts.set(st, (counts.get(st) ?? 0) + 1);
  const failing = Object.entries(raws)
    .map(([id, raw]) => [id, providerStatus(raw)] as const)
    .filter(([id, s]) => s.failedUnits > 0 && r.results[id] !== undefined)
    .map(([id, s]) => `${id} (${(s.reason ?? "").slice(0, 80)})`);
  const prev = r.previous;
  const lines = [
    `data: Nachtlauf ${r.date} (${r.build.offers} Angebote, ${changed} Anbieter geändert)`,
    "",
    `Angebote ${de(r.build.offers)}${prev ? ` (vorher ${de(prev.offers)})` : ""}, Termine ${de(r.build.sessions)}` +
      `${prev ? ` (vorher ${de(prev.sessions)})` : ""}`,
    `Anbieter: ${[...counts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, n]) => `${k} ${n}`)
      .join(", ")}`,
  ];
  if (failing.length > 0) lines.push(`Fehler: ${failing.join(", ")}`);
  lines.push(...categoryLines(r, raws));
  if (r.abort || r.brake || r.budgetHit)
    lines.push(`Vorzeitig beendet: ${r.abort ?? r.brake ?? "Zeitbudget"} (Rest unverändert)`);
  lines.push(
    `Modellaufrufe ${c.total.calls}, durch den Cache gespart ${c.cachedCalls}, ${usd(c.total.costUsd)} (${COST_LABEL})`,
    "",
    "Plan 0032, E6 (pnpm pipeline nightly, publish)",
  );
  return lines.join("\n");
}
