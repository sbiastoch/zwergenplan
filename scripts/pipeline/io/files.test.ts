import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readIdAcceptance } from "./files.ts";

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
});
