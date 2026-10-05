import { describe, expect, it } from "vitest";
import { germanTextField } from "./labels.ts";

const GERMAN = ["coalesce", ["get", "name:de"], ["get", "name_de"], ["get", "name"]];

describe("deutsche Kartenbeschriftung (Plan 0008, E16)", () => {
  it("ersetzt coalesce(name_en, name)", () => {
    expect(germanTextField(["coalesce", ["get", "name_en"], ["get", "name"]])).toEqual([
      "coalesce",
      GERMAN,
      ["get", "name"],
    ]);
  });

  it("ersetzt verschachtelt in case/concat und format (wie die OpenFreeMap-Stile)", () => {
    const ofm = [
      "case",
      ["has", "name:nonlatin"],
      ["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
      ["coalesce", ["get", "name_en"], ["get", "name"]],
    ];
    expect(germanTextField(ofm)).toEqual([
      "case",
      ["has", "name:nonlatin"],
      ["concat", GERMAN, "\n", ["get", "name:nonlatin"]],
      ["coalesce", GERMAN, ["get", "name"]],
    ]);
    expect(germanTextField(["format", ["get", "name_int"], { "font-scale": 1.2 }])).toEqual([
      "format",
      GERMAN,
      { "font-scale": 1.2 },
    ]);
  });

  it("ersetzt eine Token-Zeichenkette aus genau einem Namens-Token", () => {
    expect(germanTextField("{name_en}")).toEqual(GERMAN);
    expect(germanTextField("{name:latin}")).toEqual(GERMAN);
    expect(germanTextField("{name_int}")).toEqual(GERMAN);
  });

  it("lässt alles andere unverändert", () => {
    expect(germanTextField("{housenumber}")).toBe("{housenumber}");
    expect(germanTextField("{name_en} {ref}")).toBe("{name_en} {ref}");
    const ref = ["to-string", ["get", "ref"]];
    expect(germanTextField(ref)).toBe(ref);
    expect(germanTextField(["get", "name"])).toEqual(["get", "name"]);
    expect(germanTextField(undefined)).toBeUndefined();
    expect(germanTextField(42)).toBe(42);
  });

  it("verändert die Eingabe nicht", () => {
    const input = ["coalesce", ["get", "name_en"], ["get", "name"]];
    const copy = structuredClone(input);
    germanTextField(input);
    expect(input).toEqual(copy);
  });
});
