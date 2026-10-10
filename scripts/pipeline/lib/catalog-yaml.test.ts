import { describe, expect, it } from "vitest";
import { appendEntries, providerIdsOf } from "./catalog-yaml.ts";

const CATALOG = `# Kopf
- id: a
  role: verzeichnis
  programme:
    - url: https://example.org/
      kind: html
  notes:
    - erste Notiz
    - zweite Notiz
`;

describe("appendEntries", () => {
  it("hängt an, ohne Kommentare und Notizlisten der übrigen Einträge umzuformen (Plan 0030, Review M4)", () => {
    const out = appendEntries(CATALOG, [{ id: "b", topics: ["x", "y"], notes: ["neu"], geo: { lat: 1, lon: 2 } }]);
    expect(out.startsWith("# Kopf\n- id: a\n")).toBe(true);
    expect(out).toContain("  notes:\n    - erste Notiz\n    - zweite Notiz\n");
    expect(out).toContain("  notes:\n    - neu\n");
    expect(out).toContain("topics: [ x, y ]");
    expect(out).toContain("geo: { lat: 1, lon: 2 }");
  });
});

describe("providerIdsOf", () => {
  it("liest nur die IDs, auch aus Paketen mit Feldern eines älteren Katalogs (Review M5)", () => {
    expect(providerIdsOf([{ id: "a", topics: ["pekip"], formats: ["kurs"] }, { id: "b" }])).toEqual(["a", "b"]);
    expect(() => providerIdsOf([{ name: "ohne id" }])).toThrow();
  });
});
