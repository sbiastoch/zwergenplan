/**
 * Extraktion eines Anbieters, reine Teile (Plan 0032, E4): Antwortschema, Nachricht an das Modell, Prüfung der
 * Antwort und Ablauf Wiederholung → Fallback. Den Modellaufruf liefert der Aufrufer (`io/extract.ts` über
 * `io/llm.ts`), hier steht nur die Entscheidung, was mit einer Antwort geschieht.
 */
import { z } from "zod";
import type { Provider } from "../../../src/domain/schema.ts";
import { type Candidate, Candidate as CandidateSchema } from "./candidate.ts";
import { type RawContext, RawEvent, validateRaw } from "./raw.ts";

export interface ExtractInput {
  provider: Provider;
  /** Eingabe wie aus dem Abruf (`fetchInputs().texts[id]`, enthält die Kandidaten schon als eigenen Abschnitt) */
  text: string;
  candidates: readonly Candidate[];
  /** abgerufene URLs, Redirect-Ziele und Kandidaten-`detailUrl`: nur sie sind als `sourceUrl` erlaubt */
  allowedUrls: readonly string[];
  /** YYYY-MM-DD in Berlin */
  today: string;
}

export interface CallRecord {
  step: "extract" | "fallback";
  providerId: string;
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
  | { kind: "ok"; events: RawEvent[]; model: string }
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

/** Antwort des Modells: `RawEvent` ohne `providerId` und `via`, die setzt der Code (E4). */
const ExtractResponse = z.strictObject({ events: z.array(RawEvent.omit({ providerId: true, via: true })) });

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
 * Fachliche Prüfung einer Antwort: `validateRaw` nur mit diesem Anbieter, dazu `sourceUrl` aus `allowedUrls`.
 * `providerId` und `via` setzt der Code (E4), `via` aus dem Kandidaten, dessen `detailUrl` die `sourceUrl` ist.
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
  return r.ok ? { ok: true, events: r.batch.events, warnings: r.warnings } : { ok: false, errors: r.errors };
}

/**
 * Kandidaten und erlaubte URLs aus einer gespeicherten Abruf-Ausgabe (`pipeline fetch`: `<id>.txt` und der Eintrag
 * aus `hashes.json`), nur für die Probe `pipeline extract --from`. Der Text enthält fremden Seitentext; deshalb gilt
 * nur der **letzte** Abschnitt `## Kandidaten (N)` (`assembleProvider` hängt ihn ans Ende), und nur, wenn N der Zahl
 * aus `hashes.json` entspricht. Der Nachtlauf (Teil B) nimmt die Kandidaten direkt aus dem Abruf, nie aus dem Text.
 */
export function inputsFromFetch(
  text: string,
  entry: { candidates: number; pages: ReadonlyArray<{ url: string; ok: boolean }> },
): { candidates: Candidate[]; allowedUrls: string[] } {
  const parts = text.split(/^## Kandidaten \((\d+)\)$/m);
  const count = parts.length >= 3 ? Number(parts.at(-2)) : 0;
  const section = entry.candidates > 0 && count === entry.candidates ? (parts.at(-1) ?? "") : "";
  const lines = section.split("\n").filter((l) => l.startsWith("{"));
  const candidates = lines.length === entry.candidates ? lines.flatMap(parseCandidate) : [];
  const allowedUrls = [...entry.pages.filter((p) => p.ok).map((p) => p.url), ...candidates.map((c) => c.detailUrl)];
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

/** Nachricht an das Modell (stdin): Datum und Horizont, Katalogauszug, dann der abgerufene Text. */
export function extractMessage(input: {
  provider: Provider;
  text: string;
  ctx: Pick<ExtractContext, "horizon">;
}): string {
  const { from, to } = input.ctx.horizon;
  return [
    `Heute: ${from}\nHorizont: ${from} bis ${to}`,
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
    if (a.checked?.ok) return { kind: "ok", events: a.checked.events, model: a.model };
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
