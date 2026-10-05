import { describe, expect, it } from "vitest";
import { placeLine } from "./place-format.ts";

describe("Orts-Liste (Plan 0005, E7)", () => {
  it("Zeile: Stadtteil bzw. Adresse, Zahl, Entfernung", () => {
    const place = { district: "Gostenhof", address: "Beispielweg 1, 90429 Nürnberg", offers: [1, 2, 3] };
    expect(placeLine(place, undefined)).toBe("Gostenhof · 3 Angebote");
    expect(placeLine({ address: "Beispielweg 1", offers: [1] }, { kind: "luftlinie", meters: 1427 })).toBe(
      "Beispielweg 1 · 1 Angebot · 1,4 km",
    );
    expect(placeLine(place, { kind: "oepnv", minutes: 23, byFoot: false })).toBe("Gostenhof · 3 Angebote · 25 Min.");
  });
});
