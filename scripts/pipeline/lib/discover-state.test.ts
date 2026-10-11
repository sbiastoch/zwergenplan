import { describe, expect, it } from "vitest";
import { DiscoverState, reservedConflicts } from "./discover-state.ts";

const state = DiscoverState.parse({
  region: "nuernberg",
  abgelehnt: [{ id: "alt-anbieter", publicId: "abcd1234", grund: "zurückgenommen", datum: "2026-10-11" }],
  zurueckgestellt: [],
});

describe("reservedConflicts (ADR 0022, Rücknahme)", () => {
  it("meldet eine wieder vergebene Katalog-ID oder publicId, egal über welchen Weg", () => {
    const issues = reservedConflicts(
      [
        { id: "alt-anbieter", publicId: "zzzz9999" },
        { id: "neu-anbieter", publicId: "abcd1234" },
        { id: "sammelkalender" },
      ],
      [state],
    );
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatch(/Katalog-ID alt-anbieter/);
    expect(issues[1]).toMatch(/publicId abcd1234 \(neu-anbieter\)/);
  });

  it("ohne Treffer nichts", () => {
    expect(reservedConflicts([{ id: "x", publicId: "y0000000" }], [state])).toEqual([]);
  });
});
