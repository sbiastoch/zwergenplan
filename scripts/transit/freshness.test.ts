import { describe, expect, it } from "vitest";
import { timetableWarnings } from "./freshness.ts";

const source = { validTo: "2026-12-12" };
// 12:00 Berliner Zeit (MEZ) – unabhängig von der Test-Zeitzone America/Los_Angeles
const at = (iso: string) => new Date(`${iso}T12:00:00+01:00`);

describe("timetableWarnings", () => {
  it("schweigt, solange der Fahrplan noch mindestens 14 Tage gilt", () => {
    expect(timetableWarnings(source, at("2026-11-28"), { fixture: false, network: "vgn" })).toEqual([]);
  });

  it("warnt weniger als 14 Tage vor dem Fahrplanwechsel", () => {
    const [w, ...rest] = timetableWarnings(source, at("2026-11-29"), { fixture: false, network: "vgn" });
    expect(rest).toEqual([]);
    expect(w).toMatch(/VGN-Fahrplanwechsel steht an.*12\.12\.2026.*neuen VGN-Feed.*pnpm pipeline oepnv --netz vgn/);
  });

  it("gilt am letzten Gültigkeitstag noch als gültig (nur die Vorwarnung)", () => {
    expect(timetableWarnings(source, at("2026-12-12"), { fixture: false, network: "vgn" }).join()).toMatch(/steht an/);
  });

  it("warnt nach Ablauf mit Befehl zum Erneuern", () => {
    const [w] = timetableWarnings(source, at("2026-12-13"), { fixture: false, network: "vgn" });
    expect(w).toMatch(/abgelaufen.*12\.12\.2026.*pnpm pipeline oepnv --netz vgn/);
  });

  it("nennt das Netz im Text (Plan 0039, E4)", () => {
    const [w] = timetableWarnings({ validTo: "2027-02-28" }, at("2027-02-20"), { fixture: false, network: "vrr" });
    expect(w).toBe(
      "VRR-Fahrplanwechsel steht an: Auszug gültig bis 28.02.2027 – neuen VRR-Feed mit `pnpm pipeline oepnv --netz vrr` holen",
    );
  });

  it("bestimmt „heute“ in Berlin, nicht in der Geräte-Zeitzone", () => {
    // 13.12. 00:30 in Berlin ist in Los Angeles noch der 12.12.
    expect(
      timetableWarnings(source, new Date("2026-12-13T00:30:00+01:00"), { fixture: false, network: "vgn" }).join(),
    ).toMatch(/abgelaufen/);
  });

  it("warnt nie für Fixtures", () => {
    expect(timetableWarnings(source, at("2030-01-01"), { fixture: true, network: "vgn" })).toEqual([]);
  });
});
