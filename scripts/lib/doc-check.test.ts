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
const DONE = "# Plan\n\nStatus: abgeschlossen, live seit abc1234 (2026-10-05). Restpunkte in docs/ideas.md\n";

describe("checkDocs, Regel 3: Nummern eindeutig (Plan 0027, E11)", () => {
  it("lässt eindeutige Plan- und ADR-Nummern durch", () => {
    expect(
      repo({
        "docs/plans/0001-a.md": PLAN,
        "docs/plans/archiv/0002-b.md": DONE,
        "docs/adr/0001-a.md": "# ADR",
      }),
    ).toEqual([]);
  });

  it("meldet eine Plan-Nummer, die aktiv und im Archiv vorkommt", () => {
    expect(repo({ "docs/plans/0003-a.md": PLAN, "docs/plans/archiv/0003-b.md": DONE })).toEqual([
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

describe("checkDocs, Regeln 1 und 2: Planstatus und Archiv (Plan 0027, E11, Etappe 6)", () => {
  it.each([
    "Status: Entwurf, wartet auf Plan-Review",
    "Status: Review eingearbeitet, Nachprüfung ausstehend",
    "Status: freigegeben (2 Review-Runden)",
    "Status: in Umsetzung – Etappe 3",
  ])("aktiver Plan mit „%s“ ist gültig", (status) => {
    expect(repo({ "docs/plans/0001-a.md": `# Plan 0001 – A\n\n${status}\nDatum: x\n` })).toEqual([]);
  });

  it.each([
    "Status: abgeschlossen, live seit 61de0da (2026-10-05). Restpunkte in docs/ideas.md",
    "Status: ersetzt durch Plan 0017",
  ])("archivierter Plan mit „%s“ ist gültig", (status) => {
    expect(repo({ "docs/plans/archiv/0001-a.md": `# Plan\n\n${status}\n` })).toEqual([]);
  });

  it("die erste nicht-leere Zeile nach dem Titel zählt", () => {
    expect(repo({ "docs/plans/0001-a.md": "# Plan\n\n\n\nStatus: Entwurf\n" })).toEqual([]);
    expect(repo({ "docs/plans/0001-a.md": "# Plan\n\nDatum: x\nStatus: Entwurf\n" })).toEqual([
      "docs/plans/0001-a.md: erste Zeile nach dem Titel ist keine gültige Statuszeile („Datum: x“)",
    ]);
  });

  it.each([
    "Status: umgesetzt",
    "Status: **freigegeben**",
    "Status: abgeschlossen",
    "Status: abgeschlossen, live seit irgendwann",
    "Status: abgeschlossen, live seit 61de0da (5.10.2026)",
  ])("„%s“ ist keine gültige Statuszeile", (status) => {
    expect(repo({ "docs/plans/0001-a.md": `# Plan\n\n${status}\n` })).toHaveLength(1);
  });

  it("ein abgeschlossener Plan außerhalb des Archivs ist rot", () => {
    expect(
      repo({ "docs/plans/0001-a.md": "# Plan\n\nStatus: abgeschlossen, live seit abc1234 (2026-10-05)\n" }),
    ).toEqual(["docs/plans/0001-a.md: Status „abgeschlossen“ gehört nach docs/plans/archiv/ (verschieben)"]);
  });

  it("ein ersetzter Plan außerhalb des Archivs ist rot (Arch-Review e6, m8)", () => {
    expect(repo({ "docs/plans/0001-a.md": "# Plan\n\nStatus: ersetzt durch Plan 0017\n" })).toEqual([
      "docs/plans/0001-a.md: Status „ersetzt“ gehört nach docs/plans/archiv/ (verschieben)",
    ]);
  });

  it("ein Plan ohne `# `-Titel ist rot (Arch-Review e6, m8)", () => {
    expect(repo({ "docs/plans/0001-a.md": "Status: Entwurf\n" })).toEqual([
      "docs/plans/0001-a.md: kein Titel („# Plan NNNN – …“) vor der Statuszeile",
    ]);
  });

  it("ein aktiver Plan im Archiv ist rot", () => {
    expect(repo({ "docs/plans/archiv/0001-a.md": "# Plan\n\nStatus: freigegeben\n" })).toEqual([
      "docs/plans/archiv/0001-a.md: im Archiv liegen nur Pläne mit Status „abgeschlossen“ oder „ersetzt“",
    ]);
  });

  it("prüft keine Dateien ohne Plannummer und keine ADRs", () => {
    expect(repo({ "docs/plans/README.md": "x", "docs/adr/0001-a.md": "# ADR\n\nStatus: angenommen\n" })).toEqual([]);
  });
});
