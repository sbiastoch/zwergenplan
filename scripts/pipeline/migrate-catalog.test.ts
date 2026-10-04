import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { validateDataset } from "../../src/domain/dataset.ts";
import type { Provider } from "../../src/domain/schema.ts";
import { LEGACY_KEYS, migrateCatalog, parseLegacyAge } from "./migrate-catalog.ts";

const legacy = parse(
  readFileSync(new URL("../../tests/fixtures/pipeline/legacy-catalog.yaml", import.meta.url), "utf8"),
) as Array<Record<string, unknown>>;
const migrated = migrateCatalog(legacy);
const byId = (id: string): Provider => {
  const p = migrated.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return p;
};
const EMPTY_OFFERS = {
  generatedAt: "2026-10-04T12:00:00+02:00",
  horizon: { from: "2026-10-04", to: "2027-02-04" },
  offers: [],
};

describe("migrateCatalog (eingefrorener Auszug im Skill-Format)", () => {
  it("ergibt einen gültigen Katalog inkl. Rollen-Invarianten", () => {
    const r = validateDataset(migrated, EMPTY_OFFERS);
    expect(r.ok ? [] : r.errors).toEqual([]);
    expect(migrated).toHaveLength(legacy.length);
  });

  it("kennt jedes Altfeld (Feldbilanz)", () => {
    const keys = new Set(legacy.flatMap((p) => Object.keys(p)));
    expect([...keys].filter((k) => !LEGACY_KEYS.includes(k))).toEqual([]);
  });

  it("führt den doppelten Hauptort zusammen und verschiebt Orte ohne Koordinaten in notes", () => {
    const zoff = byId("zoff-harmonie");
    expect(zoff.venues).toEqual([
      {
        id: "zoff-harmonie",
        name: "Haus der Katholischen Stadtkirche",
        address: "Vordere Sterngasse 1, 90402 Nürnberg (Haus der Katholischen Stadtkirche)",
        district: "Altstadt (St. Lorenz)",
        ring: "innen",
        geo: { lat: 49.448549, lon: 11.078269 },
      },
    ]);
    expect(zoff.notes).toContain(
      "Wechselnder Treffpunkt: Waldspielgruppen / Papa+Ich Wald (Treffpunkt je Kurs auf Detailseite), wechselnd, Nürnberger Wald",
    );
    expect(zoff.costs).toEqual(["kostenpflichtig", "kostenlos"]);
    expect(zoff.age).toEqual({ minMonths: 0, maxMonths: 48 });
  });

  it("gibt weiteren Orten stabile IDs und kurze Namen; Klammerzusätze landen in notes", () => {
    const fbs = byId("fbs-nuernberg");
    expect(fbs.venues.map((v) => v.id)).toEqual([
      "fbs-nuernberg",
      "fbs-nuernberg-gemeindehaus-thomaskirche",
      "fbs-nuernberg-waldracker",
      "fbs-nuernberg-wald-angebot-steinbruechlein",
    ]);
    expect(fbs.venues[0]?.name).toBe("FBS Haupthaus");
    expect(fbs.notes).toContain("Ort FBS Haupthaus: Kursräume Zimmer 2/5/10, Offener Bereich");
    expect(fbs.url).toBe("https://www.fbs-nuernberg.de/kursprogramm/eltern-kind-kurse/");
  });

  it("benennt den Hauptort nach dem ersten Adressteil oder dem Anbieter", () => {
    expect(byId("die-familienbox").venues[0]?.name).toBe(byId("die-familienbox").name);
    const kuf = byId("kuf-kinderkultur-aggregator");
    expect(kuf.role).toBe("aggregator");
    expect(kuf.venues.length).toBe(3);
  });

  it("übernimmt Rollen, coveredBy und Adapter", () => {
    const ev = byId("ev-zerzabelshof-musikzwerge");
    expect(ev.role === "anbieter" && ev.coveredBy).toBe("et-dekanat-nuernberg");
    const stadt = byId("stadt-nuernberg-veranstaltungskalender");
    expect(stadt.role === "aggregator" && stadt.adapter).toBe("stadt-vk");
    expect(stadt.venues).toEqual([]);
    expect(stadt.notes).toContain("Sitz: Stadt Nürnberg, Rathausplatz 2, 90403 Nürnberg");
    expect(byId("curt-termine-familie").notes ?? "").not.toContain("Sitz:");
    expect(byId("familienbildung-nuernberg-0-3").role).toBe("verzeichnis");
  });

  it("wendet die Ausnahmeliste laut notes an (Review 2)", () => {
    const kath = byId("kath-stadtkirche-familiengottesdienste");
    expect(kath.role).toBe("aggregator");
    expect(kath.age).toEqual({ minMonths: 0, maxMonths: 144 });
    expect(kath.venues).toEqual([]);
    expect(kath.notes).toContain("Sitz: Vordere Sterngasse 1");
  });
});

describe("parseLegacyAge", () => {
  it.each([
    ["0-3", { minMonths: 0, maxMonths: 36 }],
    ["0-1", { minMonths: 0, maxMonths: 12 }],
    ["1-2", { minMonths: 12, maxMonths: 24 }],
    ["0-12", { minMonths: 0, maxMonths: 12 }],
    ["0-6", { minMonths: 0, maxMonths: 72 }],
    ["4 Mon-3 J", { minMonths: 4, maxMonths: 36 }],
    ["3", { minMonths: 36, maxMonths: 36 }],
    ["alle", undefined],
    [undefined, undefined],
  ])("%s", (spec, expected) => {
    expect(parseLegacyAge(spec)).toEqual(expected);
  });

  it("wertet „0-12“ mit Option als Jahre", () => {
    expect(parseLegacyAge("0-12", { years: true })).toEqual({ minMonths: 0, maxMonths: 144 });
  });

  it("wirft bei unbekanntem Format", () => {
    expect(() => parseLegacyAge("ab Geburt")).toThrow("Altersangabe");
  });
});
