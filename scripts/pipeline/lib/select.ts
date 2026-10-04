/**
 * Katalog → Pakete für die Recherche-Subagenten (aus select_providers.py). Ein Lauf deckt immer den
 * ganzen Katalog ab; Filter nach Thema/Ring/Alter gibt es nicht mehr (Plan 0002).
 */
import type { Provider } from "../../../src/domain/schema.ts";

export interface Selection {
  batches: Provider[][];
  /** Sammelkalender mit Adapter – laufen über `candidates fetch` */
  adapters: Array<{ id: string; adapter: string }>;
  skipped: Array<{ id: string; reason: string }>;
}

export function selectBatches(
  catalog: readonly Provider[],
  opts: { batchSize: number; only?: readonly string[] },
): Selection {
  const skipped: Selection["skipped"] = [];
  const adapters: Selection["adapters"] = [];
  const picked: Provider[] = [];
  const only = opts.only ? new Set(opts.only) : undefined;
  for (const id of only ?? []) if (!catalog.some((p) => p.id === id)) throw new Error(`Unbekannter Anbieter: ${id}`);
  for (const p of catalog) {
    if (only && !only.has(p.id)) continue;
    if (p.role === "verzeichnis") skipped.push({ id: p.id, reason: "Verzeichnis (nur Katalogpflege)" });
    else if (p.role === "aggregator") {
      if (p.adapter) adapters.push({ id: p.id, adapter: p.adapter });
      else skipped.push({ id: p.id, reason: "Sammelkalender ohne Adapter (Quelle für die Katalogpflege)" });
    } else if (p.coveredBy && !only) skipped.push({ id: p.id, reason: `Termine über ${p.coveredBy}` });
    else picked.push(p);
  }
  const size = Math.max(1, opts.batchSize);
  const batches: Provider[][] = [];
  for (let i = 0; i < picked.length; i += size) batches.push(picked.slice(i, i + size));
  return { batches, adapters, skipped };
}

/** Nächste freie Paketdateien: Ein Nachprüf-Paket (--only) überschreibt nie ein vorhandenes Paket. */
export function nextBatchFiles(existing: readonly string[], count: number): string[] {
  const used = existing.flatMap((f) => /^batch-(\d+)\.json$/.exec(f)?.[1] ?? []).map(Number);
  const start = used.length > 0 ? Math.max(...used) + 1 : 1;
  return Array.from({ length: count }, (_, i) => `batch-${start + i}.json`);
}
