import { describe, expect, it } from "vitest";
import { appendEntries, removeEntries } from "./catalog-yaml.ts";

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

describe("removeEntries (Entdecken-Eval, Plan 0032, E9)", () => {
  it("entfernt Einträge nach ID, übrige bleiben samt Kommentar unverändert", () => {
    const two = appendEntries(CATALOG, [{ id: "b", role: "verzeichnis" }]);
    const out = removeEntries(two, ["b"]);
    expect(out).toBe(CATALOG);
    expect(removeEntries(two, ["a"])).not.toMatch(/id: a\n/);
    expect(removeEntries(two, ["a"])).toMatch(/- id: b\n/);
  });
  it("unbekannte ID ist ein Fehler", () => {
    expect(() => removeEntries(CATALOG, ["gibts-nicht"])).toThrow(/gibts-nicht/);
  });
});
