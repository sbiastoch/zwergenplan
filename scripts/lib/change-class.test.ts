import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, isDocPath } from "./change-class.ts";
import { withoutGitEnv } from "./git-env.ts";

describe("isDocPath: Positivliste der Doku (Plan 0027, E1)", () => {
  it.each([
    "docs/plans/0027-verifikation-nach-risiko.md",
    "docs/plans/archiv/0001-fundament.md",
    "docs/adr/0004-backpressure.md",
    "docs/architecture.md",
    "docs/ideas.md",
    "CLAUDE.md",
    "README.md",
    ".claude/skills/plan-review/SKILL.md",
    ".claude/skills/babyevents-nuernberg/references/extraction.md",
    ".claude/agents/plan-reviewer.md",
  ])("%s ist Doku", (path) => {
    expect(isDocPath(path)).toBe(true);
  });

  it.each([
    // wird deployt und vom Service Worker vorgehalten
    "public/x.md",
    // Design-Dateien sind von Biome ausgenommen und gehören nicht zur Doku (Review 2, Minor 5)
    "docs/design/x.md",
    "docs/design/x.png",
    "docs/plans/notiz.txt",
    "src/domain/format.ts",
    "src/ui/x.md",
    ".claude/hooks/stop-gate.ts",
    ".claude/settings.json",
    ".claude/agents/sub/x.md",
    "pnpm-lock.yaml",
    "neu/x.txt",
    "README.md.bak",
    "",
  ])("%s ist keine Doku", (path) => {
    expect(isDocPath(path)).toBe(false);
  });
});

describe("classify: Stufe des Diffs", () => {
  it("leerer Diff → Stufe 0", () => {
    expect(classify([])).toEqual({ tier: "0" });
  });

  it("nur Doku → Stufe 0", () => {
    expect(classify(["docs/ideas.md", "CLAUDE.md"])).toEqual({ tier: "0" });
  });

  it("Doku plus Code → Stufe C und nennt den ersten Pfad außerhalb der Liste", () => {
    expect(classify(["docs/ideas.md", "src/domain/format.ts", "neu/x.txt"])).toEqual({
      tier: "C",
      reason: "src/domain/format.ts",
    });
  });

  it("Umbenennung zählt mit beiden Pfaden (Aufrufer nutzt --no-renames)", () => {
    expect(classify(["src/ui/a.tsx", "docs/a.md"]).tier).toBe("C");
  });

  it("unbekannter Pfad → Stufe C (fail-safe)", () => {
    expect(classify(["neu/x.txt"])).toEqual({ tier: "C", reason: "neu/x.txt" });
  });
});

/**
 * Die Stufe 0 trägt nur, solange kein Build, kein Test, kein Skript und keine Werkzeugkonfiguration Markdown liest
 * (Plan 0027, E2). Liest künftig etwas eine .md-Datei, wird dieser Test rot, statt dass Stufe 0 still falsch wird.
 */
describe("Doku liest niemand", () => {
  const SCANNED = [
    "src/",
    "scripts/",
    "e2e/",
    "push-worker/",
    ".github/workflows/",
    ".claude/hooks/",
    ".claude/settings.json",
    "vite.config.ts",
    "vitest.config.ts",
    "vitest.setup.ts",
    "playwright.config.ts",
    "biome.json",
    "knip.jsonc",
    "lefthook.yml",
    ".dependency-cruiser.cjs",
    "package.json",
    "index.html",
  ];
  // Diese Dateien dürfen Markdown lesen bzw. nennen Markdown-Pfade als Testdaten.
  const ALLOWED = new Set([
    "scripts/check-docs.ts",
    "scripts/lib/doc-check.ts",
    "scripts/lib/doc-check.test.ts",
    "scripts/lib/change-class.ts",
    "scripts/lib/change-class.test.ts",
  ]);
  // auch Vite-Importe mit Query wie "./x.md?raw" (Arch-Review m2)
  const MD_STRING = /\.md(\?[^"'`]*)?["'`]|\*\.md\b|\.md\$/;
  const READS = /readFileSync|readFile\b|readdirSync|readdir\b|import\b|fetch\(|glob|endsWith|include|entry|project/;

  it("keine eingecheckte Code- oder Konfigurationsdatei liest .md", () => {
    // nur lesend, im Projekt, ohne geerbte GIT_*-Variablen (git-env.ts)
    const files = execFileSync("git", ["ls-files", "--", ...SCANNED], { encoding: "utf8", env: withoutGitEnv() })
      .split("\n")
      .filter((f) => f !== "" && !ALLOWED.has(f) && !f.startsWith("tests/"));
    expect(files.length).toBeGreaterThan(50);
    const hits: string[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue; // im Index, aber gelöscht
      }
      text.split("\n").forEach((line, i) => {
        if (MD_STRING.test(line) && READS.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("es gibt keine getrackten Symlinks, über die eine Doku-Datei Code sein könnte", () => {
    const links = execFileSync("git", ["ls-files", "-s"], { encoding: "utf8", env: withoutGitEnv() })
      .split("\n")
      .filter((l) => l.startsWith("120000 "));
    expect(links).toEqual([]);
  });

  it("Biome verarbeitet weder docs/ noch CLAUDE.md", () => {
    const r = spawnSync("pnpm", ["exec", "biome", "check", "docs", "CLAUDE.md", "README.md"], { encoding: "utf8" });
    expect(`${r.stdout}${r.stderr}`).toContain("Checked 0 files");
  });
});
