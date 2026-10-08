/**
 * Doku-Gate (Plan 0027, E11): eindeutige Plan- und ADR-Nummern, keine toten Pfadverweise und Markdown-Links.
 * Nur Node-Builtins. Läuft als Stufe 0 von verify und als Schritt von check:fast.
 * Geprüft werden getrackte und neue, nicht ignorierte Dateien (`git ls-files`); ignorierte wie .claude/worktrees/
 * nie. tests/fixtures/docs/ ist Testmaterial und bleibt außen vor.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { checkDocs } from "./lib/doc-check.ts";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
})
  .split("\n")
  // im Index, aber im Arbeitsbaum gelöscht: gilt als nicht vorhanden
  .filter((f) => f !== "" && !f.startsWith("tests/fixtures/docs/") && existsSync(f));

const present = new Set(files);
const errors = checkDocs({
  files,
  read: (p) => readFileSync(p, "utf8"),
  exists: (p) => present.has(p),
});

for (const e of errors) console.error(`✗ ${e}`);
console.log(`check-docs ${errors.length === 0 ? "grün" : "ROT"}: ${files.length} Dateien`);
process.exit(errors.length === 0 ? 0 : 1);
