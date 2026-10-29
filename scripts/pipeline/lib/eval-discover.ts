/**
 * Stichproben des Entdecken-Evals (Plan 0050, E6): Format von `evals/discover.json` und die geschichtete Ziehung
 * mit festem Zufall (`scripts/pipeline/draw-eval-sample.ts`). Rein, ohne Dateizugriff.
 */
import { z } from "zod";
import type { RegionId } from "../../../src/domain/regions.ts";

/** Trägerarten (Plan 0045, E7); kein Katalogfeld, von Hand je Anbieter zugeordnet */
const TRAEGER_ARTEN = [
  "familienbildung",
  "gemeinde",
  "verein",
  "einzelperson",
  "schwimmschule",
  "musikschule",
  "familienzentrum",
  "plattform",
  "sonstige",
] as const;
type TraegerArt = (typeof TRAEGER_ARTEN)[number];

export const SAMPLE_SIZE = 20;

/**
 * Regionen der Anbieter je Stichprobe. Fürth hat keine eigene (zu wenige Anbieter); Fürther Anbieter stehen in der
 * Nürnberger, denn Nürnberg und Fürth laufen gemeinsam (Plan 0050, E6).
 */
export const SAMPLE_REGIONS: Readonly<Record<string, readonly RegionId[]>> = { nuernberg: ["nuernberg", "fuerth"] };

const SampleEntry = z.strictObject({
  id: z.string().min(1),
  /** schon in den Evals vor Plan 0050 ausgeblendet */
  alt: z.literal(true).optional(),
  notiz: z.string().min(1).optional(),
});

export const DiscoverEvalSchema = z.strictObject({
  seed: z.number().int(),
  stichproben: z.record(z.string(), z.array(SampleEntry)),
  arten: z.record(z.string(), z.enum(TRAEGER_ARTEN)),
});

/** mulberry32: kleiner, reproduzierbarer Zufall in [0, 1) */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n proportional auf die Schichten verteilt (größter Rest), nie mehr als eine Schicht hat */
export function allocate(sizes: Readonly<Record<string, number>>, n: number): Record<string, number> {
  const strata = Object.entries(sizes).sort(([a], [b]) => (a < b ? -1 : 1));
  const total = strata.reduce((s, [, size]) => s + size, 0);
  const target = Math.min(n, total);
  const out = new Map(strata.map(([k, size]) => [k, target === 0 ? 0 : Math.floor((size * target) / total)]));
  const fraction = ([k, size]: [string, number]) => (size * target) / total - (out.get(k) ?? 0);
  const byRemainder = [...strata].sort((a, b) => fraction(b) - fraction(a) || (a[0] < b[0] ? -1 : 1));
  let rest = target - [...out.values()].reduce((s, x) => s + x, 0);
  while (rest > 0) {
    for (const [k, size] of byRemainder) {
      const got = out.get(k) ?? 0;
      if (rest > 0 && got < size) {
        out.set(k, got + 1);
        rest--;
      }
    }
  }
  return Object.fromEntries(out);
}

/** n IDs geschichtet nach Art; unabhängig von der Reihenfolge des Pools (sortiert vor dem Mischen) */
export function drawStratified(pool: readonly { id: string; art: TraegerArt }[], n: number, seed: number): string[] {
  const random = seededRandom(seed);
  const strata = new Map<string, string[]>();
  for (const { id, art } of pool) strata.set(art, [...(strata.get(art) ?? []), id]);
  const counts = allocate(Object.fromEntries([...strata].map(([art, ids]) => [art, ids.length])), n);
  return [...strata.keys()].sort().flatMap((art) =>
    (strata.get(art) ?? [])
      .sort()
      .map((id) => ({ id, key: random() }))
      .sort((a, b) => a.key - b.key)
      .slice(0, counts[art] ?? 0)
      .map(({ id }) => id),
  );
}
