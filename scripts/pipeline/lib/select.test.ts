import { describe, expect, it } from "vitest";
import type { Provider } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import { nextBatchFiles, selectBatches } from "./select.ts";

const { providers, anbieter } = loadFixtures();
function fail(): never {
  throw new Error("Fixture");
}
const { name, url, programme, availability, verified } = anbieter[0] ?? fail();
const source = { region: "nuernberg" as const, name, url, programme, availability, verified };
const catalog: Provider[] = [
  ...providers.map((p) => (p.id === "theater-beispiel" ? { ...p, coveredBy: "kalender" } : p)),
  { ...source, id: "kalender", role: "aggregator", adapter: "stadt-vk" },
  { ...source, id: "anderer-kalender", role: "aggregator" },
  { ...source, id: "liste", role: "verzeichnis" },
];

describe("selectBatches", () => {
  it("packt Anbieter in Pakete und lässt Sammelkalender, Verzeichnisse und abgedeckte Anbieter aus", () => {
    const s = selectBatches(catalog, { batchSize: 3 });
    expect(s.batches.map((b) => b.map((p) => p.id))).toEqual([
      ["familientreff-beispiel", "musikschule-beispiel", "stadtbibliothek-beispiel"],
      ["gemeinde-beispiel", "turnverein-beispiel"],
    ]);
    expect(s.adapters).toEqual([
      { id: "sammelkalender-beispiel", adapter: "frankenkids" },
      { id: "kalender", adapter: "stadt-vk" },
    ]);
    expect(s.skipped.map((x) => x.id)).toEqual(["theater-beispiel", "anderer-kalender", "liste"]);
  });

  it("--only prüft gezielt einzelne Anbieter, auch abgedeckte", () => {
    const s = selectBatches(catalog, { batchSize: 7, only: ["theater-beispiel"] });
    expect(s.batches.map((b) => b.map((p) => p.id))).toEqual([["theater-beispiel"]]);
    expect(() => selectBatches(catalog, { batchSize: 7, only: ["gibts-nicht"] })).toThrow("Unbekannter Anbieter");
    expect(selectBatches(catalog, { batchSize: 0 }).batches).toHaveLength(5);
  });
});

describe("nextBatchFiles", () => {
  it("nummeriert hinter den vorhandenen Paketen weiter", () => {
    expect(nextBatchFiles([], 2)).toEqual(["batch-1.json", "batch-2.json"]);
    expect(nextBatchFiles(["batch-1.json", "batch-9.json", "selection.json", "meta.json"], 1)).toEqual([
      "batch-10.json",
    ]);
  });
});
