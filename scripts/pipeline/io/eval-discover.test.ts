/**
 * Stichproben des Entdecken-Evals (Plan 0050, E6) gegen den echten Katalog. Geprüft wird nicht, ob `arten` den
 * ganzen Katalog abdeckt: sonst machte jeder neue Anbieter G1 und die CI rot.
 */
import { describe, expect, it } from "vitest";
import { DiscoverEvalSchema, SAMPLE_REGIONS, SAMPLE_SIZE } from "../lib/eval-discover.ts";
import { DISCOVER_EVAL, readCatalog, readJson } from "./files.ts";

const evalFile = DiscoverEvalSchema.parse(readJson(DISCOVER_EVAL));
const byId = new Map(readCatalog().map((p) => [p.id, p]));

describe("evals/discover.json", () => {
  it("jede Art gehört zu einem Anbieter im Katalog", () => {
    for (const id of Object.keys(evalFile.arten)) {
      expect(byId.get(id)?.role, id).toBe("anbieter");
    }
  });

  for (const [region, sample] of Object.entries(evalFile.stichproben)) {
    it(`Stichprobe ${region}: ${SAMPLE_SIZE} Anbieter der Region, je mit Art, ohne Doppel`, () => {
      expect(sample).toHaveLength(SAMPLE_SIZE);
      expect(new Set(sample.map((s) => s.id)).size).toBe(SAMPLE_SIZE);
      const regions: readonly string[] = SAMPLE_REGIONS[region] ?? [];
      for (const { id } of sample) {
        const p = byId.get(id);
        expect(p?.role, id).toBe("anbieter");
        expect(regions, id).toContain(p?.region);
        expect(evalFile.arten[id], id).toBeDefined();
      }
    });
  }
});
