/**
 * dependency-cruiser mit Selbstkontrolle: Findet der Parser zu wenige Module, ist die
 * Prüfung stumm kaputt (z. B. Parser-Inkompatibilität) – das ist dann selbst ein Fehler.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MIN_MODULES = 15;
const DIRS = ["src", "scripts", "e2e", ".claude/hooks"];

interface CruiseOutput {
  modules: Array<{ source: string }>;
  summary: { violations: Array<{ rule: { name: string }; from: string; to: string }> };
}

let raw: string;
try {
  raw = execFileSync("pnpm", ["exec", "depcruise", ...DIRS, "--output-type", "json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  // depcruise beendet sich bei Verstößen mit Exit ≠ 0, liefert aber trotzdem JSON
  raw = (e as { stdout?: string }).stdout ?? "";
}

let out: CruiseOutput;
try {
  out = JSON.parse(raw) as CruiseOutput;
} catch {
  console.error("✗ dependency-cruiser lieferte keine auswertbare Ausgabe");
  process.exit(1);
}

const { violations } = out.summary;
// Nur eigene Module zählen – npm-Pakete würden einen stumm kaputten Parser kaschieren.
const totalCruised = out.modules.filter(
  (m) => !m.source.includes("node_modules/") && !m.source.startsWith("node:"),
).length;
if (totalCruised < MIN_MODULES) {
  console.error(`✗ dependency-cruiser hat nur ${totalCruised} Module gefunden (< ${MIN_MODULES}) – Parser kaputt?`);
  process.exit(1);
}
if (violations.length > 0) {
  for (const v of violations) console.error(`✗ ${v.rule.name}: ${v.from} → ${v.to}`);
  console.error("Regeln und Begründungen: .dependency-cruiser.cjs, docs/architecture.md");
  process.exit(1);
}
/**
 * Lazy-Lader der Karte (Plan 0005): Ihr Ziel darf nur per import() kommen. dependency-cruiser fasst einen
 * zusätzlichen statischen Import mit dem dynamischen zu einer Kante zusammen und sähe ihn nicht.
 */
const LAZY_LOADERS: Array<[file: string, target: string]> = [
  ["src/ui/MapPanel.tsx", "./karte/"],
  ["src/ui/karte/MapScreen.tsx", "../map/"],
];
for (const [file, target] of LAZY_LOADERS) {
  // auch Seiteneffekt-Importe ohne `from` (import "./karte/MapScreen.tsx")
  const staticImport = new RegExp(`^\\s*(import|export)\\b[^;(]*?(from\\s*)?["']${target.replaceAll(".", "\\.")}`, "m");
  if (staticImport.test(readFileSync(file, "utf8"))) {
    console.error(`✗ lazy-loader-static: ${file} importiert ${target} statisch (nur import() ist erlaubt)`);
    process.exit(1);
  }
}

console.log(`✓ Architektur: ${totalCruised} Module, keine Verstöße`);
