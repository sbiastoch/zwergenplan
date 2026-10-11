/**
 * Abruf des Nachtlaufs, reine Teile (Plan 0032, E3, Stufe 1 / S1.2): Seitentext je Art, Eingabe und Hash je Anbieter,
 * Vergleich mit der Vornacht, Bericht. Das Abrufen selbst liegt in io/fetch-inputs.ts und io/browser.ts.
 */
import { z } from "zod";
import { extractPage } from "./html-extract.ts";
import { parseIcal } from "./ical.ts";
import { inputHash, normalizeWhitespace, orderFreeHash } from "./normalize.ts";
import type { PageTask } from "./select.ts";

/** Eingabe-Obergrenze je Anbieter (E3): darüber `fehler`, nie gekürzt. */
export const MAX_INPUT_CHARS = 350_000;

/** Art eines Abrufs für die Fehlerstatistik; `eingabe` ist die Obergrenze, kein Abruf. */
const ARTS = ["html", "browser", "ical", "json-api", "pdf", "adapter", "eingabe"] as const;
type Art = (typeof ARTS)[number];

export const artOf = (task: PageTask): Art => (task.render === "browser" ? "browser" : task.kind);

/**
 * Bot-Schutz statt Inhalt: Die Seite ist nicht abrufbar, auch wenn HTTP 200 kam. Ohne diese Erkennung landete die
 * Sperrseite (mit wechselnder Ray ID) als Eingabe im Hash. Muster aus Proben, nur kurze Texte (Sperrseiten sind kurz).
 */
const BOT_WALLS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  {
    name: "Cloudflare",
    pattern:
      /Sicherheitsüberprüfung wird durchgeführt|Just a moment\.\.\.|Checking your browser|challenges\.cloudflare\.com/,
  },
];
export function botWall(text: string): string | undefined {
  if (text.length > 5000) return undefined;
  const hit = BOT_WALLS.find((w) => w.pattern.test(text));
  return hit ? `Bot-Schutz (${hit.name})` : undefined;
}

/** Text einer abgerufenen Seite je Art. Links werden nie verfolgt und stehen nicht in der Eingabe. */
export function programmeText(kind: PageTask["kind"], body: string, finalUrl: string): string {
  switch (kind) {
    case "html": {
      const page = extractPage(body, finalUrl);
      const jsonLd = page.jsonLd.length > 0 ? `## JSON-LD\n${JSON.stringify(page.jsonLd, null, 1)}\n` : "";
      return `${jsonLd}## TEXT\n${page.text}`;
    }
    case "ical":
      return `## ICAL\n${JSON.stringify(parseIcal(body), null, 1)}`;
    case "json-api":
      try {
        return JSON.stringify(JSON.parse(body), null, 1);
      } catch {
        return body;
      }
    case "pdf":
      return body;
  }
}

const PageResult = z.object({
  url: z.string(),
  art: z.enum(ARTS),
  ok: z.boolean(),
  reason: z.string().optional(),
  chars: z.number().optional(),
  ms: z.number(),
});

const ProviderFetch = z.object({
  /** `leer`: weder Seiten noch Kandidaten (etwa `coveredBy` ohne Treffer) */
  status: z.enum(["ok", "leer", "fehler"]),
  inputHash: z.string().optional(),
  /** nur Messung S1.2: Hash ohne Reihenfolge der Zeilen (`orderFreeHash`) */
  orderFreeHash: z.string().optional(),
  reason: z.string().optional(),
  art: z.enum(ARTS).optional(),
  chars: z.number(),
  candidates: z.number(),
  pages: z.array(PageResult),
});
type ProviderFetch = z.infer<typeof ProviderFetch>;

/** `hashes.json`: Ergebnis je Anbieter, Grundlage des Vergleichs mit der Vornacht (`--compare`). */
export const HashesFile = z.record(z.string(), ProviderFetch);
export type HashesFile = z.infer<typeof HashesFile>;

export type PageOutcome =
  /** `finalUrl`: Ziel nach Redirects, falls anders (erlaubte `sourceUrl`, Plan 0032, E4) */
  | { url: string; art: Art; ok: true; text: string; ms: number; finalUrl?: string }
  | { url: string; art: Art; ok: false; reason: string; ms: number };

const de = (n: number) => n.toLocaleString("de-DE");

/** Eingabe eines Anbieters: normalisierter Text aller Seiten plus Kandidaten, Hash und Status (E3). */
export function assembleProvider(input: {
  pages: readonly PageOutcome[];
  candidates: readonly unknown[];
  /** Ausfall des Sammelkalenders, über den der Anbieter seine Termine bekommt */
  adapterFailure?: string;
}): { entry: ProviderFetch; text: string } {
  const pages = input.pages.map(
    ({ url, art, ok, ms, ...rest }): z.infer<typeof PageResult> =>
      "text" in rest ? { url, art, ok, ms, chars: rest.text.length } : { url, art, ok, ms, reason: rest.reason },
  );
  const base = { chars: 0, candidates: input.candidates.length, pages };
  const failed = input.pages.flatMap((p) => (p.ok ? [] : [p]));
  const [first] = failed;
  if (first) {
    const more = failed.length > 1 ? ` (+${failed.length - 1} weitere)` : "";
    return {
      entry: { ...base, status: "fehler", art: first.art, reason: `${first.url}: ${first.reason}${more}` },
      text: "",
    };
  }
  if (input.adapterFailure)
    return { entry: { ...base, status: "fehler", art: "adapter", reason: input.adapterFailure }, text: "" };
  const fetched = input.pages.flatMap((p) => (p.ok ? [p] : []));
  const doc = [
    ...fetched.map((p, i) => `## Seite ${i + 1}: ${p.url} (${p.art})\n${p.text}`),
    ...(input.candidates.length > 0
      ? [`## Kandidaten (${input.candidates.length})\n${input.candidates.map((c) => JSON.stringify(c)).join("\n")}`]
      : []),
  ].join("\n\n");
  if (doc.length > MAX_INPUT_CHARS)
    return {
      entry: {
        ...base,
        chars: doc.length,
        status: "fehler",
        art: "eingabe",
        reason: `Eingabe zu groß (${de(doc.length)} Zeichen)`,
      },
      text: "",
    };
  const hashInput = { pages: fetched.map((p) => ({ url: p.url, text: p.text })), candidates: input.candidates };
  return {
    entry: {
      ...base,
      chars: doc.length,
      status: doc === "" ? "leer" : "ok",
      inputHash: inputHash(hashInput),
      orderFreeHash: orderFreeHash(hashInput),
    },
    text: normalizeWhitespace(doc),
  };
}

export interface Comparison {
  /** Anbieter mit Hash in beiden Nächten */
  compared: number;
  changed: string[];
  /** davon auch ohne Reihenfolge der Zeilen geändert (Messung, `orderFreeHash`) */
  changedOrderFree: string[];
  /** jetzt mit Hash, in der Vornacht ohne (neu oder vorher Fehler) */
  appeared: string[];
  /** in der Vornacht mit Hash, jetzt ohne */
  disappeared: string[];
}

export function compareHashes(prev: HashesFile, cur: HashesFile): Comparison {
  const hashOf = (f: HashesFile, id: string) => f[id]?.inputHash;
  const ids = [...new Set([...Object.keys(prev), ...Object.keys(cur)])].sort();
  const both = ids.filter((id) => hashOf(prev, id) && hashOf(cur, id));
  const changed = both.filter((id) => hashOf(prev, id) !== hashOf(cur, id));
  return {
    compared: both.length,
    changed,
    // ohne orderFreeHash (ältere hashes.json) zählt die Änderung
    changedOrderFree: changed.filter(
      (id) => !prev[id]?.orderFreeHash || prev[id]?.orderFreeHash !== cur[id]?.orderFreeHash,
    ),
    appeared: ids.filter((id) => hashOf(cur, id) && !hashOf(prev, id)),
    disappeared: ids.filter((id) => hashOf(prev, id) && !hashOf(cur, id)),
  };
}

export interface AdapterOutcome {
  status: "ok" | "fehler";
  reason?: string;
  candidates: number;
  /** davon einem Katalog-Anbieter zugeordnet */
  matched: number;
  warnings: string[];
}

/**
 * Ausfall eines Sammelkalenders für einen Anbieter (E5: „Seite oder Adapter ausgefallen, auch teilweise“). Wer nur
 * Kandidaten bekommt (`coveredBy`, `skipCrawl`), hat ohne vollständige Adapter keine verlässliche Eingabe; welcher
 * Adapter seine Kandidaten liefert, steht vorher nicht fest, also zählt jeder Ausfall und jede Warnung. Bei eigenen
 * Seiten ergänzen Kandidaten nur.
 */
export function adapterFailureFor(
  via: "seiten" | "kandidaten",
  adapters: Readonly<Record<string, AdapterOutcome>>,
): string | undefined {
  if (via === "seiten") return undefined;
  const entries = Object.entries(adapters).sort(([a], [b]) => a.localeCompare(b));
  const down = entries.find(([, a]) => a.status === "fehler");
  if (down) return `${down[0]}: ${down[1].reason ?? "Fehler"}`;
  const partial = entries.find(([, a]) => a.warnings.length > 0);
  if (partial) return `${partial[0]}: Teilausfall (${partial[1].warnings.length} Warnungen): ${partial[1].warnings[0]}`;
  return undefined;
}

const percent = (part: number, whole: number) => (whole === 0 ? "–" : `${Math.round((part / whole) * 100)} %`);

/** `report.md` und `$GITHUB_STEP_SUMMARY` (Stufe 1: nur Abruf und Hashes). */
export function renderFetchMarkdown(input: {
  date: string;
  durationMs: number;
  providers: HashesFile;
  adapters: Readonly<Record<string, AdapterOutcome>>;
  skipped: ReadonlyArray<{ id: string; reason: string }>;
  comparison: Comparison | undefined;
}): string {
  const entries = Object.entries(input.providers);
  const count = (s: ProviderFetch["status"]) => entries.filter(([, e]) => e.status === s).length;
  const biggest = entries.reduce<[string, number]>((m, [id, e]) => (e.chars > m[1] ? [id, e.chars] : m), ["–", 0]);
  const totalChars = entries.reduce((s, [, e]) => s + e.chars, 0);
  const minutes = (input.durationMs / 60_000).toLocaleString("de-DE", { maximumFractionDigits: 1 });
  const out = [
    `# Abruf ${input.date} (Plan 0032, S1.2: nur Abruf und Hashes)`,
    "",
    `- Dauer: ${minutes} Min. (${Math.round(input.durationMs / 1000)} s)`,
    `- Anbieter: ${entries.length} gesamt, ${count("ok")} ok, ${count("leer")} leer, ${count("fehler")} fehler` +
      ` (nicht abgerufen: ${input.skipped.length})`,
    `- Zeichen: ${de(totalChars)} gesamt, max ${de(biggest[1])} (${biggest[0]})`,
    "",
    "## Abrufe je Art",
    "",
    "| Art | Abrufe | Fehler | Beispiele |",
    "|---|---|---|---|",
  ];
  const adapterRows = Object.entries(input.adapters);
  for (const art of ARTS) {
    const pages = entries.flatMap(([id, e]) => e.pages.filter((p) => p.art === art).map((p) => ({ id, p })));
    const failures =
      art === "adapter"
        ? adapterRows.flatMap(([name, a]) => (a.status === "fehler" ? [`${name}: ${a.reason ?? ""}`] : []))
        : art === "eingabe"
          ? entries.flatMap(([id, e]) => (e.art === "eingabe" ? [`${id}: ${e.reason ?? ""}`] : []))
          : pages.flatMap(({ id, p }) => (p.ok ? [] : [`${id}: ${p.url}: ${p.reason ?? ""}`]));
    const total = art === "adapter" ? adapterRows.length : art === "eingabe" ? entries.length : pages.length;
    if (total === 0) continue;
    const examples = failures.slice(0, 3).map((f) => f.replaceAll("|", "/").slice(0, 160));
    out.push(`| ${art} | ${total} | ${failures.length} | ${examples.join("<br>")} |`);
  }
  if (adapterRows.length > 0) {
    out.push(
      "",
      "## Sammelkalender",
      "",
      "| Adapter | Status | Kandidaten | zugeordnet | Warnungen |",
      "|---|---|---|---|---|",
    );
    for (const [name, a] of adapterRows)
      out.push(
        `| ${name} | ${a.status}${a.reason ? `: ${a.reason}` : ""} | ${a.candidates} | ${a.matched} | ${a.warnings.length} |`,
      );
  }
  out.push("", "## Vergleich mit der Vornacht", "");
  const c = input.comparison;
  if (!c) out.push("kein Vorlauf (erste Nacht oder Cache leer)");
  else {
    out.push(
      `Geändert: ${c.changed.length} von ${c.compared} (${percent(c.changed.length, c.compared)})`,
      `Geändert ohne Reihenfolge der Zeilen: ${c.changedOrderFree.length} von ${c.compared} ` +
        `(${percent(c.changedOrderFree.length, c.compared)}; nur Messung, kein Cache-Schlüssel)`,
      `Neu mit Hash: ${c.appeared.length}, ohne Hash (Fehler oder entfallen): ${c.disappeared.length}`,
    );
    if (c.changed.length > 0) out.push("", "Geänderte Anbieter:", "", ...c.changed.map((id) => `- ${id}`));
  }
  const failed = entries.filter(([, e]) => e.status === "fehler");
  if (failed.length > 0) {
    out.push("", "## Anbieter mit Fehler", "");
    for (const [id, e] of failed) out.push(`- ${id} (${e.art ?? "?"}): ${e.reason ?? ""}`);
  }
  return `${out.join("\n")}\n`;
}

/**
 * Führt `fn` für alle Einträge aus, höchstens `total` gleichzeitig und `perKey` je Schlüssel (Host). Ergebnisse in
 * Eingabereihenfolge. Rein bis auf die Nebenläufigkeit; `fn` darf nicht werfen (Fehler als Ergebnis liefern).
 */
export function runLimited<T, R>(
  items: readonly T[],
  limits: { total: number; perKey: number },
  keyOf: (item: T) => string,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  const waiting = items.map((item, i) => ({ item, i, key: keyOf(item) }));
  const active = new Map<string, number>();
  let running = 0;
  return new Promise((resolve, reject) => {
    const pump = () => {
      if (waiting.length === 0 && running === 0) {
        resolve(out);
        return;
      }
      while (running < limits.total) {
        const at = waiting.findIndex((w) => (active.get(w.key) ?? 0) < limits.perKey);
        if (at < 0) return;
        const [next] = waiting.splice(at, 1);
        if (!next) return;
        running++;
        active.set(next.key, (active.get(next.key) ?? 0) + 1);
        fn(next.item).then((r) => {
          out[next.i] = r;
          running--;
          active.set(next.key, (active.get(next.key) ?? 0) - 1);
          pump();
        }, reject);
      }
    };
    pump();
  });
}
