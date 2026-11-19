import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readIdAcceptance, readIdAcceptanceOrWarn, readResting, writeResting } from "./files.ts";

describe("readIdAcceptance (ADR 0041, Punkt 7)", () => {
  const dirs: string[] = [];
  const dataDir = (yaml?: string) => {
    const dir = mkdtempSync(join(tmpdir(), "zp-hinnehmen-"));
    dirs.push(dir);
    if (yaml !== undefined) writeFileSync(join(dir, "id-hinnehmen.yaml"), yaml);
    return dir;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("fehlt die Datei, ist die Liste leer", () => {
    expect(readIdAcceptance(dataDir())).toEqual([]);
  });

  it("liest die Einträge", () => {
    const yaml = "- anbieter: familientreff-beispiel\n  grund: Kurs neu zugeschnitten\n  datum: 2026-11-02\n";
    expect(readIdAcceptance(dataDir(yaml))).toEqual([
      { anbieter: "familientreff-beispiel", grund: "Kurs neu zugeschnitten", datum: "2026-11-02" },
    ]);
  });

  it("ungültig: Fehler mit Pfad der Datei", () => {
    const dir = dataDir("- anbieter: familientreff-beispiel\n  datum: 2026-11-02\n");
    expect(() => readIdAcceptance(dir)).toThrow(join(dir, "id-hinnehmen.yaml"));
    expect(() => readIdAcceptance(dataDir("- [kaputt"))).toThrow(/id-hinnehmen\.yaml/);
  });

  it("readIdAcceptanceOrWarn: kaputte Datei bricht den Nachtlauf nicht ab, sondern meldet und gilt als leer (Arch-Review B, m6)", () => {
    const warnings: string[] = [];
    const dir = dataDir("- [kaputt");
    expect(readIdAcceptanceOrWarn(dir, (m) => warnings.push(m))).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(join(dir, "id-hinnehmen.yaml"));
    const yaml = "- anbieter: familientreff-beispiel\n  grund: Kurs neu zugeschnitten\n  datum: 2026-11-02\n";
    expect(readIdAcceptanceOrWarn(dataDir(yaml), (m) => warnings.push(m))).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });
});

describe("readResting / writeResting (Plan 0061, E2)", () => {
  const dirs: string[] = [];
  const file = (content?: string) => {
    const dir = mkdtempSync(join(tmpdir(), "zp-ruhend-"));
    dirs.push(dir);
    const path = join(dir, "ruhend.json");
    if (content !== undefined) writeFileSync(path, content);
    return path;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const NOW = "2026-11-19T06:00:00+01:00";
  const entry = {
    id: "aaaaaaaa",
    key: "k",
    providerId: "anbieter-a",
    venueId: "anbieter-a-haus",
    title: "Krabbeltreff",
    format: "regelmaessig" as const,
    restingSince: "2026-11-12T06:00:00+01:00",
    horizonTo: "2027-03-04",
    starts: ["2026-11-25T10:00:00+01:00"],
  };

  it("schreibt einen Eintrag je Zeile und liest ihn unverändert zurück", () => {
    const path = file();
    const resting = { generatedAt: NOW, entries: [entry, { ...entry, id: "bbbbbbbb" }] };
    writeResting(resting, path);
    expect(
      readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => l.includes('"id"')),
    ).toHaveLength(2);
    expect(readResting(path, NOW)).toEqual({ resting });
    writeResting({ generatedAt: NOW, entries: [] }, path);
    expect(readResting(path, NOW)).toEqual({ resting: { generatedAt: NOW, entries: [] } });
  });

  it("fehlt, kein JSON oder ungültig: leere Ruhe mit Hinweis, kein Wurf", () => {
    for (const path of [file(), file("{kaputt"), file(JSON.stringify({ generatedAt: NOW, entries: [{ id: 1 }] }))]) {
      const r = readResting(path, NOW);
      expect(r.resting).toEqual({ generatedAt: NOW, entries: [] });
      expect(r.warning).toContain("ohne Ruhe gebaut");
    }
  });
});
