import { describe, expect, it } from "vitest";
import { allocate, DiscoverEvalSchema, drawStratified, seededRandom } from "./eval-discover.ts";

describe("seededRandom", () => {
  it("liefert bei gleichem Seed dieselbe Folge in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
    expect(seededRandom(43)()).not.toBe(xs[0]);
  });
});

describe("allocate", () => {
  it("verteilt proportional zur Schichtgröße, Rest nach größtem Bruchteil", () => {
    expect(allocate({ gemeinde: 20, verein: 10, einzelperson: 10 }, 4)).toEqual({
      gemeinde: 2,
      verein: 1,
      einzelperson: 1,
    });
  });

  it("gibt nie mehr als die Schicht hat und lässt leere Schichten leer", () => {
    const a = allocate({ gemeinde: 1, verein: 0, sonstige: 9 }, 10);
    expect(a).toEqual({ gemeinde: 1, verein: 0, sonstige: 9 });
  });

  it("summiert genau auf n, wenn genug da ist", () => {
    const a = allocate({ a: 7, b: 5, c: 3, d: 1 }, 10);
    expect(Object.values(a).reduce((s, x) => s + x, 0)).toBe(10);
  });
});

describe("drawStratified", () => {
  const pool = [
    ...["g1", "g2", "g3", "g4", "g5", "g6"].map((id) => ({ id, art: "gemeinde" as const })),
    ...["v1", "v2", "v3"].map((id) => ({ id, art: "verein" as const })),
    { id: "e1", art: "einzelperson" as const },
  ];

  it("ist mit gleichem Seed reproduzierbar und je Schicht proportional", () => {
    const a = drawStratified(pool, 5, 7);
    expect(drawStratified(pool, 5, 7)).toEqual(a);
    expect(a).toHaveLength(5);
    expect(new Set(a).size).toBe(5);
    expect(a.filter((id) => id.startsWith("g"))).toHaveLength(3);
  });

  it("hängt nicht von der Reihenfolge des Pools ab", () => {
    expect(drawStratified([...pool].reverse(), 5, 7)).toEqual(drawStratified(pool, 5, 7));
  });
});

describe("DiscoverEvalSchema", () => {
  it("nimmt Stichprobe mit alt und notiz, lehnt unbekannte Art ab", () => {
    const ok = {
      seed: 1,
      stichproben: {
        nuernberg: [
          { id: "a", alt: true },
          { id: "b", notiz: "gezogen" },
        ],
      },
      arten: { a: "verein", b: "gemeinde" },
    };
    expect(DiscoverEvalSchema.parse(ok).stichproben["nuernberg"]).toHaveLength(2);
    expect(() => DiscoverEvalSchema.parse({ ...ok, arten: { a: "zirkus" } })).toThrow();
  });
});
