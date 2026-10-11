/**
 * Abruf aller Eingaben des Nachtlaufs nach Plan (Plan 0032, E3; Stufe 1 / S1.2 misst damit Hash-Rauschen und
 * Fehler). Erst die Sammelkalender (eigene Paginierung, `io/sources.ts`), dann alle Programmseiten mit höchstens
 * 4 Abrufen parallel und 2 je Host. Kein Modellaufruf, nichts nach `data/`.
 */
import { execFile } from "node:child_process";
import type { Provider } from "../../../src/domain/schema.ts";
import { type Candidate, isSource } from "../lib/candidate.ts";
import {
  type AdapterOutcome,
  adapterFailureFor,
  artOf,
  assembleProvider,
  botWall,
  type HashesFile,
  type PageOutcome,
  programmeText,
  runLimited,
} from "../lib/fetch.ts";
import { anbieterVids, matchCandidate } from "../lib/match.ts";
import { placeholderWindow } from "../lib/placeholders.ts";
import type { FetchedProvider } from "../lib/refresh.ts";
import type { FetchPlan, PageTask } from "../lib/select.ts";
import { browserSession } from "./browser.ts";
import { fetchBytes, fetchPage } from "./http.ts";
import { fetchSource } from "./sources.ts";

const LIMITS = { total: 4, perKey: 2 };

/** Eine Zeile je Fehler, ohne Stacktrace; Zeitüberschreitung und Netzfehler lesbar. */
function reasonOf(e: unknown): string {
  if (e instanceof Error && e.name === "TimeoutError") return "Zeitüberschreitung";
  const c = e instanceof Error ? e.cause : undefined;
  const cause = c instanceof Error ? ` (${"code" in c && typeof c.code === "string" ? c.code : c.message})` : "";
  const msg = e instanceof Error ? e.message : String(e);
  return `${msg.split("\n")[0]}${cause}`.replace(/\s+/g, " ").slice(0, 200);
}

function pdftotext(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "pdftotext",
      ["-q", "-enc", "UTF-8", "-", "-"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
      (err, stdout, stderr) =>
        err ? reject(new Error(`pdftotext: ${stderr.trim() || err.message}`)) : resolve(stdout),
    );
    // pdftotext kann vor dem Ende der Eingabe aussteigen; EPIPE meldet dann der Callback, kein Absturz
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(bytes);
  });
}

/** PDF abrufen und über `pdftotext` lesen; HTTP ≥ 400 und leeres PDF sind Fehler. Auch fürs Bewerten (Entdecken). */
async function fetchPdf(url: string): Promise<{ text: string; finalUrl: string }> {
  const res = await fetchBytes(url);
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  const text = await pdftotext(res.bytes);
  if (text.trim() === "") throw new Error("leeres PDF");
  return { text, finalUrl: res.finalUrl };
}

/** Text eines PDF (Entdecken, `DiscoverDeps.fetchPdfText`) */
export const fetchPdfText = async (url: string): Promise<string> => (await fetchPdf(url)).text;

/** Bot-Schutz zählt als Fehler (vor dem HTTP-Status, damit der Grund lesbar ist). */
function checked(status: number, text: string): string {
  const wall = botWall(text);
  if (wall) throw new Error(status >= 400 ? `${wall}, HTTP ${status}` : wall);
  if (status >= 400) throw new Error(`HTTP ${status}`);
  return text;
}

async function fetchTask(
  task: PageTask,
  browser: ReturnType<typeof browserSession>,
): Promise<{ text: string; finalUrl: string }> {
  if (task.render === "browser") {
    const page = await browser.render(task.url);
    return { text: checked(page.status, programmeText("html", page.body, page.finalUrl)), finalUrl: page.finalUrl };
  }
  if (task.kind === "pdf") return fetchPdf(task.url);
  const headers =
    task.kind === "json-api"
      ? {
          Accept: "application/json",
          ...(task.request ? { "Content-Type": "application/json" } : {}),
          ...task.request?.headers,
        }
      : {};
  const page = await fetchPage(task.url, { headers, ...(task.request ? { post: task.request.body } : {}) });
  return { text: checked(page.status, programmeText(task.kind, page.body, page.finalUrl)), finalUrl: page.finalUrl };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export interface FetchResult {
  providers: HashesFile;
  /** Eingabetext (nur Leerraum normalisiert) je Anbieter (nur ok) */
  texts: Record<string, string>;
  adapters: Record<string, AdapterOutcome>;
  /** Eingabe je Anbieter für Schlüssel und Extraktion (Plan 0032, E4/E5) */
  inputs: Record<string, FetchedProvider>;
}

export async function fetchInputs(plan: FetchPlan, catalog: readonly Provider[], today: string): Promise<FetchResult> {
  const { von, bis } = placeholderWindow(today);
  const adapters: Record<string, AdapterOutcome> = {};
  const byProvider = new Map<string, Candidate[]>();
  await Promise.all(
    plan.adapters.map(async ({ id, adapter }) => {
      try {
        const r = await fetchSource(adapter, von, bis, { vids: anbieterVids(catalog, id) });
        let matched = 0;
        for (const c of r.candidates) {
          const m = matchCandidate(c, catalog);
          if (m.kind !== "ok") continue;
          matched++;
          byProvider.set(m.providerId, [...(byProvider.get(m.providerId) ?? []), c]);
        }
        adapters[adapter] = { status: "ok", candidates: r.candidates.length, matched, warnings: r.warnings };
      } catch (e) {
        adapters[adapter] = { status: "fehler", reason: reasonOf(e), candidates: 0, matched: 0, warnings: [] };
      }
    }),
  );

  const browser = browserSession();
  const tasks = plan.providers.flatMap((p) => p.pages.map((task) => ({ provider: p.id, task })));
  let outcomes: PageOutcome[];
  try {
    outcomes = await runLimited(
      tasks,
      LIMITS,
      (t) => hostOf(t.task.url),
      async ({ task }): Promise<PageOutcome> => {
        const started = performance.now();
        const ms = () => Math.round(performance.now() - started);
        try {
          const { text, finalUrl } = await fetchTask(task, browser);
          return {
            url: task.url,
            art: artOf(task),
            ok: true,
            text,
            ms: ms(),
            ...(finalUrl && finalUrl !== task.url ? { finalUrl } : {}),
          };
        } catch (e) {
          return { url: task.url, art: artOf(task), ok: false, reason: reasonOf(e), ms: ms() };
        }
      },
    );
  } finally {
    // ein gescheiterter Browserstart kostet nur die Browser-Seiten, nicht den Lauf (Arch-Review S1.2, Minor 4)
    await browser.close().catch(() => undefined);
  }

  const providers: HashesFile = {};
  const texts: Record<string, string> = {};
  const inputs: Record<string, FetchedProvider> = {};
  // Ausfälle der Sammelkalender bewertet die Regel je Anbieter (lib/refresh.ts), nicht der Abruf (Arch-Review S2, B1)
  const adapterIssues: FetchedProvider["adapterIssues"] = {};
  for (const [name, a] of Object.entries(adapters)) {
    if (!isSource(name)) continue;
    if (a.status === "fehler") adapterIssues[name] = a.reason ?? "Fehler";
    else if (a.warnings.length > 0)
      adapterIssues[name] = `Teilausfall (${a.warnings.length} Warnungen): ${a.warnings[0]}`;
  }
  const byId = new Map(catalog.map((c) => [c.id, c] as const));
  for (const p of plan.providers) {
    const pages = outcomes.filter((_, i) => tasks[i]?.provider === p.id);
    const adapterFailure = adapterFailureFor(p.via, adapters);
    const candidates = byProvider.get(p.id) ?? [];
    const r = assembleProvider({ pages, candidates, ...(adapterFailure ? { adapterFailure } : {}) });
    providers[p.id] = r.entry;
    if (r.text) texts[p.id] = r.text;
    const fetched = pages.flatMap((pg) => (pg.ok ? [pg] : []));
    // Status ohne Adapter-Ausfall (der zählt oben im Messbericht für alle Kandidaten-Anbieter)
    const own = adapterFailure ? assembleProvider({ pages, candidates }) : r;
    const owner = byId.get(p.id);
    const cover = owner?.role === "anbieter" && owner.coveredBy ? byId.get(owner.coveredBy) : undefined;
    inputs[p.id] = {
      status: own.entry.status,
      ...(own.entry.reason ? { reason: own.entry.reason } : {}),
      via: p.via,
      ...(cover?.role === "aggregator" ? { ownAdapter: cover.adapter } : {}),
      adapterIssues,
      pages: fetched.map((pg) => ({ url: pg.url, text: pg.text })),
      candidates,
      text: own.text,
      allowedUrls: [
        ...new Set([
          ...fetched.flatMap((pg) => [pg.url, ...(pg.finalUrl ? [pg.finalUrl] : [])]),
          ...candidates.flatMap((c) => [c.detailUrl, ...(c.ticketUrl ? [c.ticketUrl] : [])]),
        ]),
      ],
    };
  }
  return { providers, texts, adapters, inputs };
}
