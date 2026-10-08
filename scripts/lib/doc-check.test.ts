import { describe, expect, it } from "vitest";
import { checkDocs } from "./doc-check.ts";

/** Repo im Speicher: Pfad → Inhalt. Alles, was nicht drinsteht, existiert nicht. */
function repo(files: Record<string, string>): string[] {
  return checkDocs({
    files: Object.keys(files),
    read: (p) => files[p] ?? "",
    exists: (p) => p in files,
  });
}

const PLAN = "# Plan\n\nStatus: Entwurf\n";

describe("checkDocs, Regel 3: Nummern eindeutig (Plan 0027, E11)", () => {
  it("lässt eindeutige Plan- und ADR-Nummern durch", () => {
    expect(
      repo({
        "docs/plans/0001-a.md": PLAN,
        "docs/plans/archiv/0002-b.md": PLAN,
        "docs/adr/0001-a.md": "# ADR",
      }),
    ).toEqual([]);
  });

  it("meldet eine Plan-Nummer, die aktiv und im Archiv vorkommt", () => {
    expect(repo({ "docs/plans/0003-a.md": PLAN, "docs/plans/archiv/0003-b.md": PLAN })).toEqual([
      "Plan-Nummer 0003 doppelt: docs/plans/0003-a.md, docs/plans/archiv/0003-b.md",
    ]);
  });

  it("meldet eine doppelte ADR-Nummer", () => {
    expect(repo({ "docs/adr/0020-a.md": "#", "docs/adr/0020-b.md": "#" })).toEqual([
      "ADR-Nummer 0020 doppelt: docs/adr/0020-a.md, docs/adr/0020-b.md",
    ]);
  });

  it("zählt nur Dateien mit vierstelliger Nummer direkt im Ordner", () => {
    expect(
      repo({ "docs/plans/README.md": "x", "docs/plans/sub/0001-a.md": "x", "docs/plans/0001-a.md": PLAN }),
    ).toEqual([]);
  });
});

describe("checkDocs, Regel 4: Pfadverweise", () => {
  it("lässt Verweise auf vorhandene Plan- und ADR-Dateien durch, auch aus Code", () => {
    expect(
      repo({
        "docs/plans/0001-a.md": PLAN,
        "docs/adr/0004-b.md": "#",
        "src/x.ts": "// siehe docs/plans/0001-a.md und docs/adr/0004-b.md",
      }),
    ).toEqual([]);
  });

  it("meldet einen toten Pfadverweis mit Datei und Zeile", () => {
    expect(repo({ "docs/ideas.md": "a\nsiehe `docs/plans/0099-weg.md`\n" })).toEqual([
      "docs/ideas.md:2: Verweis auf fehlende Datei docs/plans/0099-weg.md",
    ]);
  });

  it("prüft auch Verweise ins Archiv", () => {
    expect(repo({ "CLAUDE.md": "docs/plans/archiv/0001-a.md" })).toEqual([
      "CLAUDE.md:1: Verweis auf fehlende Datei docs/plans/archiv/0001-a.md",
    ]);
  });

  it("übergeht Platzhalter wie NNNN", () => {
    expect(repo({ "CLAUDE.md": "`docs/plans/NNNN-<thema>.md`" })).toEqual([]);
  });

  it("nimmt data/, tests/fixtures/, Unit-Tests und fremde Endungen aus (Review 2, Minor 9)", () => {
    expect(
      repo({
        "data/x.json": "docs/plans/0099-weg.md",
        "src/domain/x.test.ts": "docs/plans/0099-weg.md",
        "tests/fixtures/x.md": "docs/plans/0099-weg.md",
        "public/x.svg": "docs/plans/0099-weg.md",
      }),
    ).toEqual([]);
  });

  it("prüft relative Markdown-Links in docs/, CLAUDE.md und README.md", () => {
    expect(
      repo({
        "docs/architecture.md": "#",
        "docs/plans/0001-a.md": `${PLAN}[A](../architecture.md) [B](../fehlt.md#x) [C](https://example.org/x.md) [D](#anker)`,
        "README.md": "[Doku](docs/architecture.md) [alt](docs/weg.md)",
      }),
    ).toEqual([
      "docs/plans/0001-a.md:4: Link auf fehlende Datei ../fehlt.md",
      "README.md:1: Link auf fehlende Datei docs/weg.md",
    ]);
  });

  it("prüft Links nur in Markdown von docs/, CLAUDE.md und README.md", () => {
    expect(repo({ ".claude/skills/x/SKILL.md": "[x](fehlt.md)" })).toEqual([]);
  });
});
