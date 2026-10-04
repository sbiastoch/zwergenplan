import { describe, expect, it } from "vitest";
import { classifyRing } from "./ring.ts";

describe("classifyRing (Koordinaten aus dem Katalog)", () => {
  it("CVJM-Haus am Kornmarkt liegt innen", () => {
    expect(classifyRing(49.449186, 11.075447)).toEqual({ ring: "innen", meters: 0 });
  });

  it("FamilienBox in der Rosenaustraße liegt knapp außerhalb", () => {
    const r = classifyRing(49.449976, 11.062789);
    expect(r.ring).toBe("knapp-aussen");
    expect(r.meters).toBeGreaterThan(0);
    expect(r.meters).toBeLessThanOrEqual(700);
  });

  it("Langwasser liegt außen", () => {
    expect(classifyRing(49.4085, 11.1416).ring).toBe("aussen");
  });

  it("Stadtteil „Altstadt, St. Lorenz“ zählt als innen, auch wenn das grobe Polygon knapp verfehlt", () => {
    expect(classifyRing(49.4463, 11.0778, "Altstadt, St. Lorenz").ring).toBe("innen");
    expect(classifyRing(49.4463, 11.0778).ring).toBe("knapp-aussen");
  });
});
