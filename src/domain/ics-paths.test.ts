import { describe, expect, it } from "vitest";
import { seriesIcsFileName, seriesIcsPath, sessionIcsPath } from "./ics-paths.ts";
import { fixtureOffer } from "./test-fixtures.ts";

// Pfade der statischen ICS-Dateien (ADR 0003). Eigenes Modul, damit ics.ts den Start verlässt (Plan 0010, E8 A).
describe("ICS-Pfade", () => {
  it("leitet Dateipfade aus IDs ab", () => {
    const treff = fixtureOffer("krabbeltreff");
    const [first] = treff.sessions;
    if (!first) throw new Error("Fixture ohne Termin");
    expect(seriesIcsPath(treff)).toBe(`ics/${treff.id}.ics`);
    expect(sessionIcsPath(treff, first)).toBe(`ics/${treff.id}/20261007T1000.ics`);
  });

  it("die Datei aus dem Browser heißt wie die statische Reihen-Datei (Plan 0018, ADR 0018)", () => {
    const treff = fixtureOffer("krabbeltreff");
    expect(seriesIcsFileName(treff)).toBe(`${treff.id}.ics`);
    expect(seriesIcsPath(treff).endsWith(`/${seriesIcsFileName(treff)}`)).toBe(true);
  });
});
