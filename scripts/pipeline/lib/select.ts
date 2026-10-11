/**
 * Was aus dem Katalog abgerufen wird (ADR 0025, Punkt 7): `planFetch`, die Abrufe des Nachtlaufs und des
 * Ertragsbeweises beim Entdecken je Anbieter (Plan 0032, E3).
 */
import type { Anbieter, Provider } from "../../../src/domain/schema.ts";
import { fillPlaceholders } from "./placeholders.ts";

/** Wie ein Katalog-Eintrag abgerufen wird (ADR 0025, Punkt 7 und 8). */
type CrawlRole =
  | { kind: "nie"; reason: string }
  | { kind: "adapter"; adapter: Extract<Provider, { role: "aggregator" }>["adapter"] }
  | { kind: "kandidaten"; reason: string }
  | { kind: "seiten" };

function crawlRole(p: Provider): CrawlRole {
  if (p.role === "verzeichnis") return { kind: "nie", reason: "Verzeichnis (nur Katalogpflege)" };
  if (p.role === "aggregator") return { kind: "adapter", adapter: p.adapter };
  if (p.coveredBy) return { kind: "kandidaten", reason: `Termine über ${p.coveredBy}` };
  if (p.skipCrawl) return { kind: "kandidaten", reason: `skipCrawl: ${p.skipCrawl.reason}` };
  return { kind: "seiten" };
}

function checkOnly(catalog: readonly Provider[], only: ReadonlySet<string> | undefined): void {
  for (const id of only ?? []) if (!catalog.some((p) => p.id === id)) throw new Error(`Unbekannter Anbieter: ${id}`);
}

type Programme = Anbieter["programme"][number];

/** Ein Abruf: genau diese URL, Links darauf werden nie verfolgt (Plan 0032, E3). */
export type PageTask = Pick<Programme, "url" | "kind" | "render" | "request">;

interface ProviderPlan {
  id: string;
  /** `seiten`: eigene Programmseiten (und zugeordnete Kandidaten); `kandidaten`: nur Kandidaten der Sammelkalender */
  via: "seiten" | "kandidaten";
  reason?: string;
  pages: PageTask[];
}

export interface FetchPlan {
  providers: ProviderPlan[];
  /** Sammelkalender, deren Adapter laufen (ihre `programme` ist Doku) */
  adapters: Array<{ id: string; adapter: Extract<Provider, { role: "aggregator" }>["adapter"] }>;
  skipped: Array<{ id: string; reason: string }>;
}

function pageTask(g: Programme, today: string): PageTask {
  return {
    url: fillPlaceholders(g.url, today),
    kind: g.kind,
    ...(g.render ? { render: g.render } : {}),
    ...(g.request ? { request: { ...g.request, body: fillPlaceholders(g.request.body, today) } } : {}),
  };
}

/**
 * Abrufe des Nachtlaufs (Plan 0032, E3): `use: info` und `blocked` nie; Sammelkalender nur über ihren Adapter;
 * Anbieter mit `coveredBy` oder `skipCrawl` bekommen nur ihre Kandidaten; `{von}`/`{bis}` über `fillPlaceholders`.
 * Die Adapter laufen immer alle, auch mit `only`: Kandidaten können jedem Anbieter zugeordnet werden, und nur so
 * ist ein Hash aus `--only` mit dem des vollen Laufs vergleichbar.
 */
export function planFetch(catalog: readonly Provider[], opts: { today: string; only?: readonly string[] }): FetchPlan {
  const only = opts.only ? new Set(opts.only) : undefined;
  checkOnly(catalog, only);
  const plan: FetchPlan = { providers: [], adapters: [], skipped: [] };
  for (const p of catalog) {
    if (only && !only.has(p.id)) continue;
    const role = crawlRole(p);
    if (role.kind === "nie") plan.skipped.push({ id: p.id, reason: role.reason });
    else if (role.kind === "kandidaten")
      plan.providers.push({ id: p.id, via: "kandidaten", reason: role.reason, pages: [] });
    else if (role.kind === "seiten" && p.role === "anbieter") {
      const pages = p.programme
        .filter((g) => g.use !== "info" && g.blocked === undefined)
        .map((g) => pageTask(g, opts.today));
      plan.providers.push({ id: p.id, via: "seiten", pages });
    }
  }
  for (const p of catalog) {
    const role = crawlRole(p);
    if (role.kind === "adapter") plan.adapters.push({ id: p.id, adapter: role.adapter });
  }
  return plan;
}
