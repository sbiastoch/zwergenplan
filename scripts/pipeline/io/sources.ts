/** Abruf der drei Sammelkalender (Paginierung, Stichwörter, Parallelität). Auswertung: lib/sources/*. */
import type { Candidate, Source } from "../lib/candidate.ts";
import { EVTERMINE_API, EVTERMINE_KEYWORDS, EvtermineResponse, normalizeEvtermine } from "../lib/sources/evtermine.ts";
import { FRANKENKIDS_API, FrankenkidsPage, normalizeFrankenkids } from "../lib/sources/frankenkids.ts";
import {
  normalizeStadtVk,
  STADT_VK_API,
  STADT_VK_FIELDS,
  STADT_VK_KEYWORDS,
  StadtVkResponse,
} from "../lib/sources/stadt-vk.ts";
import { fetchJson, withParams } from "./http.ts";

/** Eine Zeile je Fehler – Zod-Fehler sonst über Dutzende Zeilen. */
function shortError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\s+/g, " ").slice(0, 200);
}

export interface SourceResult {
  candidates: Candidate[];
  warnings: string[];
}

async function pool<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

async function stadtVk(from: string, to: string): Promise<SourceResult> {
  const warnings: string[] = [];
  const pages = await pool(STADT_VK_KEYWORDS, 4, async (kw) => {
    try {
      const url = withParams(STADT_VK_API, {
        START_DATUM: from,
        ENDE_DATUM: to,
        ALLETERMINE: 1,
        MAX_LIMIT: 500,
        ORDER: "DATUM",
        AUSGABEFELDER: STADT_VK_FIELDS,
        SUCHTEXT: kw,
      });
      // Die API antwortet teils erst nach ~30 s und liefert UTF-8 mit falschem charset-Header.
      return (
        StadtVkResponse.parse(await fetchJson(url, { timeoutMs: 120_000, charset: "utf-8" })).VERANSTALTUNGEN ?? []
      );
    } catch (e) {
      warnings.push(`stadt-vk „${kw}“: ${shortError(e)}`);
      return [];
    }
  });
  if (warnings.length === STADT_VK_KEYWORDS.length) throw new Error(warnings.join("; "));
  return { candidates: normalizeStadtVk(pages.flat(), from, to), warnings };
}

async function frankenkids(from: string, to: string): Promise<SourceResult> {
  const events = [];
  for (let page = 1; page <= 40; page++) {
    const url = withParams(FRANKENKIDS_API, {
      start_date: from,
      end_date: `${to} 23:59`,
      per_page: 50,
      tags: "nuernberg",
      page,
    });
    const raw = await fetchJson(url, { timeoutMs: 60_000 });
    if (raw === undefined) break; // hinter der letzten Seite: 404
    const parsed = FrankenkidsPage.parse(raw);
    events.push(...parsed.events);
    if (page >= parsed.total_pages) break;
  }
  return { candidates: normalizeFrankenkids(events), warnings: [] };
}

async function evtermine(from: string, to: string, vids: readonly string[]): Promise<SourceResult> {
  const warnings: string[] = [];
  const queries: Array<Record<string, string>> = [
    ...EVTERMINE_KEYWORDS.map((q) => ({ q })),
    ...vids.map((vid) => ({ vid })),
  ];
  const results = await pool(queries, 5, async (q) => {
    try {
      const url = withParams(EVTERMINE_API, { region: 507, highlight: "all", itemsPerPage: 1000, ...q });
      return EvtermineResponse.parse(await fetchJson(url, { timeoutMs: 60_000 })).flatMap((x) =>
        x.Veranstaltung ? [x.Veranstaltung] : [],
      );
    } catch (e) {
      warnings.push(`evtermine ${JSON.stringify(q)}: ${shortError(e)}`);
      return [];
    }
  });
  if (warnings.length === queries.length) throw new Error(warnings.join("; "));
  return { candidates: normalizeEvtermine(results.flat(), from, to), warnings };
}

export function fetchSource(source: Source, from: string, to: string, opts: { vids: readonly string[] }) {
  switch (source) {
    case "stadt-vk":
      return stadtVk(from, to);
    case "frankenkids":
      return frankenkids(from, to);
    case "evtermine":
      return evtermine(from, to, opts.vids);
  }
}
