import { describe, expect, it } from "vitest";
import { seriesIcsPath, sessionIcsPath } from "./ics-paths.ts";
import { fixtureOffer } from "./test-fixtures.ts";

// Pfade der statischen ICS-Dateien (ADR 0003). Eigenes Modul, damit ics.ts den Start verlässt (Plan 0010, E8 A).
describe("ICS-Pfade", () => {
  it("leitet Dateipfade aus IDs ab", () => {
    const treff = fixtureOffer("krabbeltreff");
    expect(seriesIcsPath(treff)).toBe(`ics/${treff.id}.ics`);
    expect(sessionIcsPath(treff, treff.sessions[0] as never)).toBe(`ics/${treff.id}/20261007T1000.ics`);
  });
});
