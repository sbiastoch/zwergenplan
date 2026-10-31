/**
 * Extraktion eines Anbieters, reine Teile (Plan 0032, E4): Antwortschema, Nachricht an das Modell, Prüfung der
 * Antwort und Ablauf Wiederholung → Fallback. Den Modellaufruf liefert der Aufrufer (`io/extract.ts` über
 * `io/llm.ts`), hier steht nur die Entscheidung, was mit einer Antwort geschieht.
 */
import { z } from "zod";
import { CategoryField, type Provider } from "../../../src/domain/schema.ts";
import { fromBerlinLocal } from "../../../src/domain/time.ts";
import { buildOffers } from "./build-offers.ts";
import { type Candidate, Candidate as CandidateSchema } from "./candidate.ts";
import { type RawContext, RawEvent, validateRaw } from "./raw.ts";
import { mergeParts } from "./split.ts";

export interface ExtractInput {
  /** voller Katalogeintrag: gegen ihn wird die Antwort geprüft (Plan 0048, E3) */
  provider: Provider;
  /**
   * Katalogauszug der Einheit (`unitExcerpt`) für die Nachricht; ohne ihn der volle Eintrag. Nicht für die Prüfung:
   * Bei `kandidaten` verletzte er die Regel „mindestens eine Terminseite“ (S0).
   */
  excerpt?: Provider;
  /** Kennung der Einheit (`lib/units.ts`); bestimmt die Teilzeile der Nachricht */
  unit?: string;
  /** Eingabe wie aus dem Abruf (`fetchInputs().texts[id]`, enthält die Kandidaten schon als eigenen Abschnitt) */
  text: string;
  /** URLs der abgerufenen Seiten in der Reihenfolge des Texts (`## Seite k`); nur ihre Kopfzeilen sind Teilgrenzen */
  pageUrls: readonly string[];
  candidates: readonly Candidate[];
  /** abgerufene URLs, Redirect-Ziele und Kandidaten-`detailUrl`: nur sie sind als `sourceUrl` erlaubt */
  allowedUrls: readonly string[];
  /** YYYY-MM-DD in Berlin */
  today: string;
  /**
   * Nur das Fallback-Modell, ohne weiteren Fallback: zweiter Versuch nach einem Einbruch (Plan 0032, „Einbruch → ein
   * Versuch mit dem Fallback-Modell“). Die Aufrufe heißen dann `fallback`.
   */
  strong?: boolean;
}

export interface CallRecord {
  /** `search`/`assess`: Websuche und Bewerten des Entdeckens (Plan 0032, E7/E8) */
  step: "extract" | "fallback" | "search" | "assess";
  providerId: string;
  /** Teil der Eingabe („2/5“), nur wenn sie aufgeteilt wurde (`splitInput`) */
  part?: string;
  /** Einheit (Plan 0048, E9), damit `kosten.jsonl` je Seite zählt; setzt `refreshProvider` */
  unit?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  webSearchRequests: number;
  turns: number;
  durationMs: number;
  costUsd: number | null;
  result: "ok" | "invalid" | "truncated" | "abort" | "error";
}

export type ExtractOutcome =
  /** `warnings`: Hinweise aus `validateRaw` (etwa „Kurs ist schon vorbei – entfällt“), nur wenn es welche gibt */
  | { kind: "ok"; events: RawEvent[]; model: string; warnings?: string[] }
  | { kind: "fehler"; reason: string }
  | { kind: "abort"; abort: "auth" | "limit" };

export interface ExtractResult {
  outcome: ExtractOutcome;
  calls: CallRecord[];
}

export type Extractor = (input: ExtractInput, signal: AbortSignal) => Promise<ExtractResult>;

/**
 * Was außer der Eingabe in den Cache-Schlüssel geht (E4): Prompt, Antwort-Schema (Teil A: `EXTRACT_KEY_PARTS`)
 * und das konfigurierte Extraktionsmodell (N3: Ein Modellwechsel extrahiert einmal alles neu).
 */
export interface ExtractKeyParts {
  prompt: string;
  schema: string;
  model: string;
}

/**
 * Antwort des Modells: `RawEvent` ohne `providerId` und `via`, die setzt der Code (E4). `category` ist hier schon
 * Pflicht (Plan 0037, E3): Das Schema ist Teil des Cache-Schlüssels und ändert sich nur in Stufe A.
 */
const ExtractResponse = z.strictObject({
  events: z.array(RawEvent.omit({ providerId: true, via: true, keepIds: true }).extend({ category: CategoryField })),
});

/**
 * JSON Schema der Antwort für `--json-schema`, aus Zod abgeleitet wie `schema/*.json` (`scripts/export-schema.ts`).
 * Ohne `$schema`: Die CLI (2.1.296) kennt den Draft 2020-12 nicht als Meta-Schema und bricht sonst ab.
 */
export function extractResponseSchema(): object {
  const { $schema: _, ...schema } = z.toJSONSchema(ExtractResponse, { io: "input", unrepresentable: "any" });
  return schema;
}

export interface ExtractContext {
  provider: Provider;
  allowedUrls: readonly string[];
  /** Kandidaten aus Sammelkalendern: Ein Event mit ihrer `detailUrl` als `sourceUrl` bekommt `via` (E4) */
  candidates: readonly Candidate[];
  horizon: RawContext["horizon"];
  freeDays: RawContext["freeDays"];
}

/** URL-Vergleich ohne Fragment und ohne Schrägstrich am Ende des Pfads. */
function urlKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.pathname = u.pathname.replace(/\/+$/, "");
    return u.href;
  } catch {
    return url;
  }
}

export type Checked = { ok: true; events: RawEvent[]; warnings: string[] } | { ok: false; errors: string[] };

/** Nur die äußere Form; die Felder prüft `validateRaw`. */
const Outer = z.object({ events: z.array(z.looseObject({})) });
const CODE_FIELDS = ["providerId", "via"] as const;
const label = (i: number, e: Record<string, unknown>) => `events.${i} („${String(e["title"] ?? "?")}“)`;

/**
 * Build-Probelauf (E4): die Events mit `buildOffers` probehalber zu Angeboten dieses einen Anbieters machen, ohne
 * Vorstand. Findet, was `validateRaw` nicht sieht (etwa gleicher Schlüssel bei verschiedenen Merkmalen). `coveredBy`
 * fällt weg: Der Probelauf kennt den Sammelkalender nicht, und die Beziehung prüft `data:validate` am Katalog.
 */
function buildProbe(events: RawEvent[], ctx: ExtractContext): string[] {
  if (events.length === 0) return [];
  const p = ctx.provider;
  const provider: Provider = p.role === "anbieter" ? withoutCoveredBy(p) : p;

  const at = fromBerlinLocal(`${ctx.horizon.from}T00:00`);
  const { report } = buildOffers({
    batches: [{ name: p.id, checkedAt: at, batch: { providers: { [p.id]: { status: "ok", checked: [] } }, events } }],
    providers: [provider],
    freeDays: ctx.freeDays,
    horizon: ctx.horizon,
    generatedAt: at,
    sources: {},
  });
  return report.errors.map((e) => `Build-Probelauf: ${e}`);
}

function withoutCoveredBy(p: Extract<Provider, { role: "anbieter" }>): Provider {
  const { coveredBy: _, ...rest } = p;
  return rest;
}

/**
 * Fachliche Prüfung einer Antwort: `validateRaw` nur mit diesem Anbieter, dazu `sourceUrl` aus `allowedUrls` und der
 * Build-Probelauf. `providerId` und `via` setzt der Code (E4), `via` aus dem Kandidaten, dessen `detailUrl` die
 * `sourceUrl` ist.
 */
export function checkExtraction(output: unknown, ctx: ExtractContext): Checked {
  const outer = Outer.safeParse(output);
  if (!outer.success) return { ok: false, errors: ["Antwort ist kein Objekt mit events"] };
  const { events } = outer.data;
  const errors: string[] = [];
  const allowed = new Set(ctx.allowedUrls.map(urlKey));
  const viaByUrl = new Map(ctx.candidates.map((c) => [urlKey(c.detailUrl), c.source] as const));
  events.forEach((e, i) => {
    for (const f of CODE_FIELDS) if (f in e) errors.push(`${label(i, e)}: ${f} setzt der Code, nicht die Antwort`);
    // Übergang Plan 0037 (E3): `RawEvent.category` ist optional (alte Stände); entfällt in Stufe C
    if (!("category" in e)) errors.push(`${label(i, e)}.category fehlt`);
    const url = e["sourceUrl"];
    if (typeof url === "string" && !allowed.has(urlKey(url)))
      errors.push(`${label(i, e)}.sourceUrl: ${url} ist keine abgerufene Seite`);
  });
  if (errors.length > 0) return { ok: false, errors };
  const id = ctx.provider.id;
  const withCodeFields = events.map((e) => {
    const via = typeof e["sourceUrl"] === "string" ? viaByUrl.get(urlKey(e["sourceUrl"])) : undefined;
    return { ...e, providerId: id, ...(via ? { via } : {}) };
  });
  const r = validateRaw(
    {
      providers: { [id]: { status: events.length > 0 ? "ok" : "keine-termine", checked: [...ctx.allowedUrls] } },
      events: withCodeFields,
    },
    { providers: [ctx.provider], expected: [id], horizon: ctx.horizon, freeDays: ctx.freeDays },
  );
  if (!r.ok) return { ok: false, errors: r.errors };
  const probe = buildProbe(r.batch.events, ctx);
  return probe.length > 0 ? { ok: false, errors: probe } : { ok: true, events: r.batch.events, warnings: r.warnings };
}

/**
 * Kandidaten und erlaubte URLs aus einer gespeicherten Abruf-Ausgabe (`pipeline fetch`: `<id>.txt` und der Eintrag
 * aus `hashes.json`), nur für die Probe `pipeline extract --from`. Der Text enthält fremden Seitentext; deshalb gilt
 * nur der **letzte** Abschnitt `## Kandidaten (N)` (`assembleProvider` hängt ihn ans Ende), und nur, wenn N der Zahl
 * aus `hashes.json` entspricht. Der Nachtlauf (Teil B) nimmt die Kandidaten direkt aus dem Abruf, nie aus dem Text.
 */
export function inputsFromFetch(
  text: string,
  entry: { candidates: number; pages: ReadonlyArray<{ url: string; ok: boolean; finalUrl?: string | undefined }> },
): { candidates: Candidate[]; allowedUrls: string[] } {
  const parts = text.split(/^## Kandidaten \((\d+)\)$/m);
  const count = parts.length >= 3 ? Number(parts.at(-2)) : 0;
  const section = entry.candidates > 0 && count === entry.candidates ? (parts.at(-1) ?? "") : "";
  const lines = section.split("\n").filter((l) => l.startsWith("{"));
  const candidates = lines.length === entry.candidates ? lines.flatMap(parseCandidate) : [];
  // dieselbe Menge wie im Nachtlauf (`fetchInputs`): Seiten, Redirect-Ziele, detailUrl und ticketUrl der Kandidaten
  const allowedUrls = [
    ...entry.pages.flatMap((p) => (p.ok ? [p.url, ...(p.finalUrl ? [p.finalUrl] : [])] : [])),
    ...candidates.flatMap((c) => [c.detailUrl, ...(c.ticketUrl ? [c.ticketUrl] : [])]),
  ];
  return { candidates, allowedUrls: [...new Set(allowedUrls)] };
}

function parseCandidate(line: string): Candidate[] {
  try {
    const c = CandidateSchema.safeParse(JSON.parse(line));
    return c.success ? [c.data] : [];
  } catch {
    return [];
  }
}

/** Katalogauszug für das Modell: ohne `notes` (ADR 0025), IDs, Koordinaten und gesperrte oder reine Info-Seiten. */
function catalogExcerpt(p: Provider) {
  const venues =
    p.role === "anbieter" ? p.venues.map(({ id, name, address, hint }) => ({ id, name, address, hint })) : [];
  return {
    id: p.id,
    name: p.name,
    url: p.url,
    ...(p.role === "anbieter" && p.age ? { age: p.age } : {}),
    availability: p.availability,
    venues,
    programme: p.programme
      .filter((g) => g.use !== "info" && !g.blocked)
      .map(({ url, kind, render, use, hint }) => ({ url, kind, render, use, hint })),
  };
}

/**
 * Nachricht an das Modell (stdin): Datum und Horizont, Katalogauszug, dann der abgerufene Text. Bei aufgeteilter
 * Eingabe (`part`) sagt eine Zeile, dass dies ein Teil ist; der Prompt bleibt gleich (Cache-Schlüssel, E4).
 */
export function extractMessage(input: {
  provider: Provider;
  text: string;
  ctx: Pick<ExtractContext, "horizon">;
  part?: { index: number; count: number };
  /** Kennung der Einheit: Die Teilzeile nennt dann „dieser Seite“ statt „dieses Anbieters“ (Plan 0048, E3) */
  unit?: string;
}): string {
  const { from, to } = input.ctx.horizon;
  // Mit Einheit nennt der Auszug alle Seiten des Anbieters; „dieses Anbieters“ legte nahe, die übrigen Kurse stünden
  // auf den anderen Seiten (Vermutung zu geburtshaus-nuernberger-nest, S0)
  const whose =
    input.unit === undefined ? "dieses Anbieters" : input.unit === "kandidaten" ? "dieser Kandidaten" : "dieser Seite";
  const part = input.part
    ? [
        `Teil ${input.part.index} von ${input.part.count}: Die Eingabe ${whose} ist auf ${input.part.count} Aufrufe verteilt. Erfasse die Angebote, die in diesem Teil stehen; die übrigen kommen aus den anderen Teilen.`,
      ]
    : [];
  return [
    `Heute: ${from}\nHorizont: ${from} bis ${to}`,
    ...part,
    `## Anbieter\n${JSON.stringify(catalogExcerpt(input.provider), null, 1)}`,
    input.text,
  ].join("\n\n");
}

/** Was der Ablauf von einem Modellaufruf braucht (`LlmResult` aus `io/llm.ts` passt). */
export interface ModelReply {
  output: unknown;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    webSearchRequests: number;
  };
  costUsd: number | null;
  turns: number;
  durationMs: number;
  abort: "auth" | "limit" | null;
  truncated: boolean;
  error: string | null;
}

const MAX_FEEDBACK_LINES = 30;

function repairMessage(user: string, output: unknown, errors: readonly string[]): string {
  const shown = errors.slice(0, MAX_FEEDBACK_LINES);
  const more = errors.length > shown.length ? `\n- … und ${errors.length - shown.length} weitere` : "";
  return `${user}\n\n## Korrektur\nDeine vorige Antwort war ungültig. Meldungen:\n${shown.map((e) => `- ${e}`).join("\n")}${more}\n\nVorige Antwort:\n${JSON.stringify(output)}\n\nGib die vollständige, korrigierte Antwort.`;
}

/**
 * Ablauf nach E4: Modell → bei fachlich ungültiger Antwort **eine** Wiederholung mit den Meldungen → sonst **ein**
 * Versuch mit dem Fallback-Modell → sonst `fehler`. Abgeschnitten ist sofort `fehler`, ein Abbruch (Auth, Limit)
 * geht sofort zurück. Ein technischer Fehler ohne Antwort geht ohne Wiederholung zum Fallback.
 */
export async function runExtraction(p: {
  providerId: string;
  model: string;
  fallbackModel: string;
  user: string;
  ctx: ExtractContext;
  call: (model: string, user: string) => Promise<ModelReply>;
}): Promise<ExtractResult> {
  const calls: CallRecord[] = [];
  const attempt = async (step: CallRecord["step"], model: string, user: string) => {
    const reply = await p.call(model, user);
    const checked =
      reply.abort || reply.truncated || reply.output == null ? undefined : checkExtraction(reply.output, p.ctx);
    const result: CallRecord["result"] = reply.abort
      ? "abort"
      : reply.truncated
        ? "truncated"
        : !checked
          ? "error"
          : checked.ok
            ? "ok"
            : "invalid";
    calls.push({
      step,
      providerId: p.providerId,
      model,
      ...reply.usage,
      turns: reply.turns,
      durationMs: reply.durationMs,
      costUsd: reply.costUsd,
      result,
    });
    return { reply, checked, result, model };
  };
  type Attempt = Awaited<ReturnType<typeof attempt>>;
  /** Endgültiges Ergebnis, oder undefined, wenn es weitergeht. */
  const settled = (a: Attempt): ExtractOutcome | undefined => {
    if (a.reply.abort) return { kind: "abort", abort: a.reply.abort };
    if (a.reply.truncated) return { kind: "fehler", reason: `Ausgabe abgeschnitten (${a.model})` };
    if (a.checked?.ok)
      return {
        kind: "ok",
        events: a.checked.events,
        model: a.model,
        ...(a.checked.warnings.length > 0 ? { warnings: a.checked.warnings } : {}),
      };
    return undefined;
  };
  const done = (outcome: ExtractOutcome): ExtractResult => ({ outcome, calls });

  let last = await attempt("extract", p.model, p.user);
  const first = settled(last);
  if (first) return done(first);
  if (last.checked && !last.checked.ok) {
    last = await attempt("extract", p.model, repairMessage(p.user, last.reply.output, last.checked.errors));
    const second = settled(last);
    if (second) return done(second);
  }
  if (p.fallbackModel !== p.model) {
    last = await attempt("fallback", p.fallbackModel, p.user);
    const third = settled(last);
    if (third) return done(third);
  }
  const step = last.model === p.model ? "" : " und Fallback";
  return done({
    kind: "fehler",
    reason:
      last.checked && !last.checked.ok
        ? `ungültig nach Wiederholung${step}: ${last.checked.errors.slice(0, 3).join("; ")}`
        : `Fehler${step ? " im Fallback" : ""} (${last.model}): ${last.reply.error ?? "keine Ausgabe"}`,
  });
}

/**
 * Aufgeteilte Eingabe (`splitInput`): je Teil der Ablauf von `runExtraction` (Wiederholung, Fallback), dann die
 * Events aller Teile vereinigt (`mergeParts`) und gemeinsam geprüft (`checkExtraction`, auch über die Teile hinweg).
 * Scheitert ein Teil, ist der ganze Anbieter `fehler` (sein alter Stand bleibt, E5) und die übrigen Teile laufen
 * nicht mehr; ein Abbruch (Auth, Limit) und ein abgebrochener Lauf (`signal`) beenden sofort. Mit einem Teil ist das
 * genau `runExtraction`. Scheitert erst die gemeinsame Prüfung, gibt es keine Wiederholung (welcher Teil?): `fehler`
 * mit „Teile zusammen ungültig“, und weil ein Fehler keinen Cache-Schlüssel speichert, versucht es die nächste Nacht
 * erneut (Plan 0032, „Aufteilen“). `mergeParts` nimmt die bekannten Ursachen (gleiche ID) vorher heraus.
 */
export async function runExtractionInParts(p: {
  providerId: string;
  model: string;
  fallbackModel: string;
  /** Nachricht je Teil (`extractMessage` mit `part`) */
  users: readonly string[];
  /** Hinweise des Aufteilens (`splitInput`), kommen zu den Hinweisen des Ergebnisses */
  splitNotes?: readonly string[];
  ctx: ExtractContext;
  call: (model: string, user: string) => Promise<ModelReply>;
  signal?: AbortSignal;
}): Promise<ExtractResult> {
  const { users, splitNotes, ...common } = p;
  const [only] = users;
  if (users.length === 1 && only !== undefined) return runExtraction({ ...common, user: only });
  const calls: CallRecord[] = [];
  const parts: RawEvent[][] = [];
  const models: string[] = [];
  for (const [i, user] of users.entries()) {
    const label = `${i + 1}/${users.length}`;
    if (p.signal?.aborted) return { outcome: { kind: "fehler", reason: `Lauf abgebrochen vor Teil ${label}` }, calls };
    const r = await runExtraction({ ...common, user });
    calls.push(...r.calls.map((c) => ({ ...c, part: label })));
    if (r.outcome.kind === "abort") return { outcome: r.outcome, calls };
    if (r.outcome.kind === "fehler")
      return { outcome: { kind: "fehler", reason: `Teil ${label}: ${r.outcome.reason}` }, calls };
    parts.push(r.outcome.events);
    if (!models.includes(r.outcome.model)) models.push(r.outcome.model);
  }
  const merged = mergeParts(parts, { ...p.ctx.horizon, freeDays: p.ctx.freeDays });
  // `providerId` und `via` setzt checkExtraction wieder, aus denselben Regeln
  const output = { events: merged.events.map(({ providerId: _p, via: _v, ...e }) => e) };
  const checked = checkExtraction(output, p.ctx);
  if (!checked.ok)
    return {
      outcome: { kind: "fehler", reason: `Teile zusammen ungültig: ${checked.errors.slice(0, 3).join("; ")}` },
      calls,
    };
  const warnings = [...(splitNotes ?? []), ...merged.notes, ...checked.warnings];
  return {
    outcome: {
      kind: "ok",
      events: checked.events,
      model: models.join("+"),
      ...(warnings.length > 0 ? { warnings } : {}),
    },
    calls,
  };
}
