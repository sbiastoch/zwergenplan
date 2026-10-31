/**
 * Richter des ID-Gates (Plan 0049, Nachtrag 2, B3), reine Teile: Eingabe, Nachricht, Antwortschema, Auswertung,
 * Teilung großer Seiten und der Ablauf über die Teile. Den Modellaufruf liefert der Aufrufer (`io/judge.ts` über
 * `io/llm.ts`), wie bei der Extraktion (`lib/extract.ts`).
 *
 * Der Richter bekommt je gated Einheit mit Verlusten die verlorenen alten Angebote und die neu extrahierten Events
 * und sagt je altem Angebot genau eines: `gleich` (dasselbe Angebot, die ID wandert über `keepIds` mit),
 * `fehlerhaft` oder `entfallen` (die ID darf gehen) oder `unklar` (die Einheit wird gehalten, B4). Alles, was an der
 * Antwort nicht stimmt, wird hier zu `unklar`: Ein falsches `gleich` ließe eine ID auf ein anderes Angebot zeigen
 * (ADR 0022: lieber neu als vertauscht), ein Halten kostet nur Aktualität.
 */
import { z } from "zod";
import type { Anbieter } from "../../../src/domain/schema.ts";
import { type CallRecord, callRecordOf, type ModelReply, messageExcerpt } from "./extract.ts";
import type { RawEvent } from "./raw.ts";
import { type InputLayout, splitInput } from "./split.ts";

/** Ein altes Angebot mit künftigem Termin, das im neuen Build fehlt. */
export interface LostOffer {
  id: string;
  title: string;
  venueId: string;
  summary?: string;
  /** künftige Beginne, ISO mit Offset */
  starts: string[];
}

/** Ein neu extrahiertes Event der Einheit. */
export interface FreshEvent {
  /** Nummer, unter der der Richter das Event nennt (eindeutig je Eingabe) */
  index: number;
  event: RawEvent;
  /** Beginne des Events im Horizont, ISO mit Offset; `gleich` muss einen davon wählen */
  starts: string[];
  /** trägt im Build (a) schon eine alte ID: kein zulässiges Ziel (Review N2-2, M2) */
  taken: boolean;
}

export interface JudgeInput {
  providerId: string;
  /** Kennung der Einheit (`lib/units.ts`) */
  unit: string;
  /** Eingabetext der Einheit, wie ihn der Extraktor bekam */
  text: string;
  /** Katalogauszug der Einheit (`unitExcerpt`) */
  excerpt: Anbieter;
  lost: LostOffer[];
  fresh: FreshEvent[];
  /**
   * Seitengrenzen für die Teilung (`splitInput`); ohne sie wird der Text wie eine einzige Seite geteilt. Ergänzt
   * gegenüber dem Entwurf: Nur mit den URLs gilt eine Kopfzeile `## Seite k` als Grenze (Schutz gegen gefälschte).
   */
  layout?: InputLayout;
  /**
   * Hat sich der Seiteninhalt seit dem alten Stand geändert (anderer Inhaltsteil des Schlüssels)? Unterscheidet
   * `entfallen` (geänderte Seite) von `fehlerhaft` (unveränderte Seite); ohne Angabe „unbekannt“.
   */
  pageChanged?: boolean;
  /** gesetzt von `splitJudgeInput`, wenn der Text geteilt ist */
  part?: { index: number; count: number };
}

export type Verdict =
  | { id: string; kind: "gleich"; index: number; start: string }
  | { id: string; kind: "fehlerhaft"; reason: string }
  | { id: string; kind: "entfallen"; reason: string }
  | { id: string; kind: "unklar"; reason?: string };

const VERDICT_KINDS = ["gleich", "fehlerhaft", "entfallen", "unklar"] as const;

const JudgeVerdict = z.strictObject({
  /** ID des verlorenen Angebots */
  id: z.string(),
  kind: z.enum(VERDICT_KINDS),
  /** bei `gleich`: Nummer des neuen Events */
  index: z.number().int().optional(),
  /** bei `gleich`: der gewählte Beginn des neuen Events, wie in der Eingabe */
  start: z.string().optional(),
  /** Pflicht bei `fehlerhaft` und `entfallen` */
  reason: z.string().optional(),
});

/** Antwort des Modells: je verlorenem Angebot ein Urteil. */
export const JudgeResponse = z.strictObject({ verdicts: z.array(JudgeVerdict) });

/** JSON Schema der Antwort für `--json-schema`, abgeleitet wie `extractResponseSchema` (ohne `$schema`). */
export function judgeResponseSchema(): object {
  const { $schema: _, ...schema } = z.toJSONSchema(JudgeResponse, { io: "input", unrepresentable: "any" });
  return schema;
}

/** Event für die Nachricht: ohne die Felder, die der Code setzt. */
function shownEvent(e: RawEvent) {
  const { providerId: _p, via: _v, ...rest } = e;
  return rest;
}

/**
 * Nachricht an den Richter (stdin). Der Seitentext steht zuletzt, unter einer eigenen Überschrift: Er ist fremdes
 * Material, und eine gefälschte Überschrift darin kann so keinen der vorderen Abschnitte vortäuschen.
 */
export function judgeUserMessage(input: JudgeInput): string {
  const changed = input.pageChanged === undefined ? "unbekannt" : input.pageChanged ? "geändert" : "unverändert";
  const part = input.part
    ? [
        `Teil ${input.part.index} von ${input.part.count}: Der Seitentext ist auf ${input.part.count} Aufrufe verteilt, dies ist ein Teil davon. Verlorene Angebote und neue Events sind in jedem Teil vollständig. Steht ein altes Angebot nicht in diesem Teil des Textes, kann es in einem anderen stehen.`,
      ]
    : [];
  const lost = input.lost.map((l) =>
    JSON.stringify({
      id: l.id,
      title: l.title,
      venueId: l.venueId,
      ...(l.summary === undefined ? {} : { summary: l.summary }),
      starts: l.starts,
    }),
  );
  const fresh = input.fresh.map((f) =>
    JSON.stringify({
      index: f.index,
      ...(f.taken ? { vergeben: "schon vergeben, kein zulässiges Ziel" } : {}),
      starts: f.starts,
      event: shownEvent(f.event),
    }),
  );
  return [
    `Anbieter: ${input.providerId}\nEinheit: ${input.unit}\nSeite seit dem alten Stand: ${changed}`,
    ...part,
    `## Anbieter\n${JSON.stringify(messageExcerpt(input.excerpt), null, 1)}`,
    `## Verlorene Angebote (${input.lost.length})\n${lost.join("\n")}`,
    `## Neue Events (${input.fresh.length})\n${fresh.join("\n")}`,
    `## Seitentext\n${input.text}`,
  ].join("\n\n");
}

const unklar = (id: string, reason: string): Verdict => ({ id, kind: "unklar", reason });

const sameInstant = (a: string, b: string): boolean => {
  const ta = Date.parse(a);
  return a === b || (!Number.isNaN(ta) && ta === Date.parse(b));
};

/** Ein einzelnes, schon geparstes Urteil gegen die Eingabe prüfen. */
function checkVerdict(v: z.infer<typeof JudgeVerdict>, fresh: ReadonlyMap<number, FreshEvent>): Verdict {
  const reason = v.reason?.trim() ?? "";
  switch (v.kind) {
    case "gleich": {
      if (v.index === undefined) return unklar(v.id, "gleich ohne Index");
      const f = fresh.get(v.index);
      if (!f) return unklar(v.id, `gleich: Event ${v.index} gibt es nicht`);
      if (f.taken) return unklar(v.id, `gleich: Event ${v.index} ist schon vergeben`);
      // Ohne Beginn nur, wenn es genau einen gibt: dann ist nichts zu raten
      const wanted = v.start ?? (f.starts.length === 1 ? f.starts[0] : undefined);
      if (wanted === undefined) return unklar(v.id, `gleich: Event ${v.index} ohne Beginn`);
      // Gleicher Zeitpunkt in anderer Schreibweise zählt; weiter geht der Beginn der Eingabe
      const start = f.starts.find((s) => sameInstant(s, wanted));
      if (start === undefined) return unklar(v.id, `gleich: Beginn ${wanted} steht nicht an Event ${v.index}`);
      return { id: v.id, kind: "gleich", index: v.index, start };
    }
    case "fehlerhaft":
    case "entfallen":
      return reason === "" ? unklar(v.id, `${v.kind} ohne Grund`) : { id: v.id, kind: v.kind, reason };
    case "unklar":
      return reason === "" ? { id: v.id, kind: "unklar" } : { id: v.id, kind: "unklar", reason };
  }
}

type Same = Extract<Verdict, { kind: "gleich" }>;

/** Ziel eines `gleich`: der Beginn bei einem Einzeltermin, sonst das ganze Event (ein Angebot im Build). */
function targetKey(fresh: readonly FreshEvent[]): (v: Same) => string {
  const format = new Map(fresh.map((f) => [f.index, f.event.format] as const));
  return (v) => (format.get(v.index) === "einmalig" ? `${v.index}@${v.start}` : `${v.index}`);
}

/**
 * Ziele eindeutig halten: Zeigen zwei Urteile auf denselben Beginn desselben Events, oder zwei auf dasselbe Event,
 * das kein Einzeltermin ist (Kurs und regelmäßiges Angebot werden ein einziges Angebot; nur `einmalig` zerlegt der
 * Build je Termin), werden alle beteiligten `unklar`. Welches recht hätte, ist nicht zu entscheiden.
 */
function uniqueTargets(verdicts: readonly Verdict[], fresh: readonly FreshEvent[]): Verdict[] {
  const keyOf = targetKey(fresh);
  const claims = new Map<string, string[]>();
  for (const v of verdicts) if (v.kind === "gleich") claims.set(keyOf(v), [...(claims.get(keyOf(v)) ?? []), v.id]);
  return verdicts.map((v) => {
    if (v.kind !== "gleich") return v;
    const ids = claims.get(keyOf(v)) ?? [];
    return ids.length > 1 ? unklar(v.id, `gleich: Event ${v.index} doppelt beansprucht (${ids.join(", ")})`) : v;
  });
}

const Outer = z.object({ verdicts: z.array(z.unknown()) });
const idOf = (item: unknown): string | undefined =>
  typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" ? item.id : undefined;

/**
 * Antwort auswerten: genau ein Urteil je verlorener ID, in der Reihenfolge von `input.lost`. Fehlt ein Urteil, steht
 * eine ID mehrfach, ist ein Urteil ungültig, zeigt `gleich` auf ein unbekanntes oder vergebenes Event oder auf einen
 * Beginn, den das Event nicht hat, teilen sich zwei Urteile ein Ziel oder fehlt bei `fehlerhaft`/`entfallen` der
 * Grund, wird das Urteil `unklar` mit Grund. Urteile zu unbekannten IDs fallen weg; die gemeinte ID fehlt dann und
 * ist ohnehin `unklar`.
 */
export function readVerdicts(input: Pick<JudgeInput, "lost" | "fresh">, response: unknown): Verdict[] {
  const outer = Outer.safeParse(response);
  if (!outer.success) return input.lost.map((l) => unklar(l.id, "Antwort ohne verdicts"));
  const byId = new Map<string, unknown[]>();
  for (const item of outer.data.verdicts) {
    const id = idOf(item);
    if (id !== undefined) byId.set(id, [...(byId.get(id) ?? []), item]);
  }
  const fresh = new Map(input.fresh.map((f) => [f.index, f] as const));
  const verdicts = input.lost.map((l): Verdict => {
    const items = byId.get(l.id) ?? [];
    if (items.length === 0) return unklar(l.id, "kein Urteil");
    if (items.length > 1) return unklar(l.id, `${items.length} Urteile`);
    const parsed = JudgeVerdict.safeParse(items[0]);
    return parsed.success ? checkVerdict(parsed.data, fresh) : unklar(l.id, "Urteil ungültig");
  });
  return uniqueTargets(verdicts, input.fresh);
}

/**
 * Große Seitentexte teilen wie die Extraktion (`splitInput`, an denselben Grenzen); jeder Teil bekommt alle
 * verlorenen Angebote und alle neuen Events. Bis zur Schwelle bleibt die Eingabe ein Teil, ohne `part`.
 */
export function splitJudgeInput(input: JudgeInput, maxChars: number): JudgeInput[] {
  const { parts } = splitInput(input.text, maxChars, input.layout ?? { pageUrls: [], candidates: 0 });
  if (parts.length <= 1) return [input];
  return parts.map((text, i) => ({ ...input, text, part: { index: i + 1, count: parts.length } }));
}

/**
 * Urteile der Teile je ID zusammenführen (Reihenfolge des ersten Teils, alle Teile haben dieselben `lost`).
 * - Ein `gleich` aus irgendeinem Teil gewinnt: Nur der Teil, in dem das alte Angebot steht, kann es wiederfinden;
 *   die übrigen sehen seinen Text nicht und sagen dann eher `fehlerhaft` oder `unklar`. Zeigen zwei Teile auf
 *   verschiedene Ziele, ist das `unklar`.
 * - `fehlerhaft` oder `entfallen` gilt nur, wenn alle Teile es sagen: Dass ein Angebot nirgends steht, weiß erst, wer
 *   alle Teile gesehen hat. Ein einziges `unklar` (etwa „steht hier, aber kein neues Event passt“) hält es. Bei
 *   gemischtem `fehlerhaft`/`entfallen` (beide: die ID darf gehen) gilt `fehlerhaft`, der strengere Befund; die
 *   Gründe stehen zusammen im Bericht.
 * Danach gilt die Eindeutigkeit der Ziele wie in `readVerdicts` auch über die Teile hinweg.
 */
export function mergeVerdicts(parts: readonly (readonly Verdict[])[], fresh: readonly FreshEvent[]): Verdict[] {
  const [first] = parts;
  if (!first) return [];
  if (parts.length === 1) return [...first];
  const targetOf = targetKey(fresh);
  const merged = first.map(({ id }): Verdict => {
    const all = parts.map((p) => p.find((v) => v.id === id) ?? unklar(id, "kein Urteil"));
    const same = all.filter((v): v is Same => v.kind === "gleich");
    const targets = [...new Set(same.map(targetOf))];
    const [hit] = same;
    if (hit && targets.length === 1) return hit;
    if (targets.length > 1) return unklar(id, `Teile uneins: gleich ${targets.join(" / ")}`);
    const gone = all.filter((v) => v.kind === "fehlerhaft" || v.kind === "entfallen");
    if (gone.length < all.length) {
      const reasons = all.flatMap((v) => (v.kind === "unklar" && v.reason ? [v.reason] : []));
      return reasons.length > 0 ? unklar(id, [...new Set(reasons)].join("; ")) : unklar(id, "Teile uneins");
    }
    const reason = [...new Set(gone.map((v) => v.reason))].join("; ");
    return { id, kind: gone.some((v) => v.kind === "fehlerhaft") ? "fehlerhaft" : "entfallen", reason };
  });
  return uniqueTargets(merged, fresh);
}

export interface Decision {
  /** Übernahme der neuen Events genau dann, wenn kein Urteil `unklar` ist */
  adopt: boolean;
  /** je `gleich`: alte ID für Event und Beginn (wird `keepIds` am Event) */
  keepIds: Array<{ index: number; start: string; id: string }>;
  /** `fehlerhaft` und `entfallen`: Diese IDs fallen weg, Grund und Art für den Bericht */
  dropped: Verdict[];
}

export function decide(verdicts: readonly Verdict[]): Decision {
  return {
    adopt: verdicts.every((v) => v.kind !== "unklar"),
    keepIds: verdicts.flatMap((v) => (v.kind === "gleich" ? [{ index: v.index, start: v.start, id: v.id }] : [])),
    dropped: verdicts.filter((v) => v.kind === "fehlerhaft" || v.kind === "entfallen"),
  };
}

type JudgeOutcome =
  | { kind: "ok"; verdicts: Verdict[] }
  | { kind: "fehler"; reason: string }
  | { kind: "abort"; abort: "auth" | "limit" };

export interface JudgeResult {
  outcome: JudgeOutcome;
  calls: CallRecord[];
}

export type Judge = (input: JudgeInput, signal: AbortSignal) => Promise<JudgeResult>;

/**
 * Ablauf über die Teile: je Teil ein Aufruf; ohne Antwort (technischer Fehler) oder mit einer Antwort, die nicht
 * einmal die äußere Form hat, **eine** Wiederholung. Abgeschnitten ist sofort `fehler` (gleiche Eingabe, gleiche
 * Länge), ein Abbruch (Auth, Limit) geht sofort zurück, ein abgebrochener Lauf (`signal`) endet vor dem nächsten
 * Teil. Scheitert ein Teil, ist die ganze Einheit `fehler` (der Nachtlauf hält sie mit Grund `grenze`, B3). Ohne
 * verlorene Angebote gibt es keinen Aufruf.
 */
export async function runJudge(p: {
  input: JudgeInput;
  model: string;
  /** Schwelle für die Teilung (`splitJudgeInput`) */
  maxChars: number;
  call: (user: string) => Promise<ModelReply>;
  signal?: AbortSignal;
}): Promise<JudgeResult> {
  const calls: CallRecord[] = [];
  if (p.input.lost.length === 0) return { outcome: { kind: "ok", verdicts: [] }, calls };
  const parts = splitJudgeInput(p.input, p.maxChars);
  const results: Verdict[][] = [];
  for (const part of parts) {
    const label = part.part ? `${part.part.index}/${part.part.count}` : undefined;
    const where = label ? ` (Teil ${label})` : "";
    if (p.signal?.aborted) return { outcome: { kind: "fehler", reason: `Lauf abgebrochen${where}` }, calls };
    const user = judgeUserMessage(part);
    let verdicts: Verdict[] | undefined;
    let error = "";
    for (let attempt = 0; attempt < 2 && verdicts === undefined; attempt++) {
      const reply = await p.call(user);
      const readable = reply.output != null && Outer.safeParse(reply.output).success;
      const result: CallRecord["result"] = reply.abort
        ? "abort"
        : reply.truncated
          ? "truncated"
          : reply.output == null
            ? "error"
            : readable
              ? "ok"
              : "invalid";
      calls.push({
        ...callRecordOf("judge", p.input.providerId, p.model, reply, result),
        unit: p.input.unit,
        ...(label ? { part: label } : {}),
      });
      if (reply.abort) return { outcome: { kind: "abort", abort: reply.abort }, calls };
      if (reply.truncated)
        return { outcome: { kind: "fehler", reason: `Ausgabe abgeschnitten (${p.model})${where}` }, calls };
      if (readable) verdicts = readVerdicts(part, reply.output);
      else error = reply.output == null ? (reply.error ?? "keine Ausgabe") : "Antwort ohne verdicts";
    }
    if (verdicts === undefined)
      return { outcome: { kind: "fehler", reason: `Richter (${p.model})${where}: ${error}` }, calls };
    results.push(verdicts);
  }
  return { outcome: { kind: "ok", verdicts: mergeVerdicts(results, p.input.fresh) }, calls };
}
