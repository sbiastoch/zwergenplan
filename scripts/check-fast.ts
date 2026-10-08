/**
 * Schnelle Gates: Typen, Lint, Architektur, Daten, Unit-Tests, tote Pfade, Schema-Drift, Doku.
 * Gemessen 2026-10-08: lokal etwa 6 s (16 Kerne), in CI 9 s (Plan 0027, Ergebnis).
 * Läuft im Stop-Hook, im pre-commit-Hook und als erster CI-Schritt.
 * Alle Schritte laufen parallel, jeder in eigener Prozessgruppe mit Zeitlimit; Ausgabe nur für fehlgeschlagene Schritte.
 */
import { fileURLToPath } from "node:url";
import { staleInstall } from "./lib/install-state.ts";
import { runSteps } from "./lib/run-steps.ts";

// Veraltetes node_modules zuerst: sonst stünden hier nur Folgefehler wie „Cannot find module“ (Plan 0027, E6).
// Projektordner aus dem Ort dieses Skripts, nicht aus dem Arbeitsverzeichnis des Aufrufers.
const stale = staleInstall(fileURLToPath(new URL("..", import.meta.url)));
if (stale !== undefined) {
  console.error(`✗ ${stale}`);
  console.log("check:fast ROT (Installation fehlt oder ist veraltet, keine Schritte ausgeführt)");
  process.exit(1);
}

// knip und Schema-Drift laufen in der CI nur hier (ci.yml hat dafür keine eigenen Schritte mehr): nicht entfernen.
const STEPS: Array<[name: string, cmd: string[]]> = [
  ["Typen", ["pnpm", "exec", "tsc", "--noEmit", "-p", "."]],
  // Service Worker mit lib „webworker“, getrennt vom Haupt-tsconfig (Plan 0011, E3)
  ["Typen SW", ["pnpm", "exec", "tsc", "--noEmit", "-p", "src/sw"]],
  // Unit-Tests des Service Workers mit Node-Typen; der Produktivcode oben bleibt ohne (Plan 0017, Arch-Review N8)
  ["Typen SW-Tests", ["pnpm", "exec", "tsc", "--noEmit", "-p", "src/sw/tsconfig.test.json"]],
  // Cloudflare Worker der Push-Abos mit Workers-Typen (Plan 0011, E11; Plan 0017)
  ["Typen Worker", ["pnpm", "exec", "tsc", "--noEmit", "-p", "push-worker"]],
  ["Lint", ["pnpm", "exec", "biome", "check", "."]],
  ["Architektur", ["node", "scripts/check-architecture.ts"]],
  ["Daten", ["node", "scripts/validate-data.ts"]],
  ["Unit-Tests", ["pnpm", "exec", "vitest", "run", "--reporter=dot"]],
  // Bis Plan 0027 nur in CI: 8 von 11 nicht absichtlich roten CI-Läufen waren knip (Plan 0027, E2)
  ["Tote Pfade", ["pnpm", "exec", "knip"]],
  ["Schema-Drift", ["node", "scripts/export-schema.ts", "--check"]],
  // Nummern und Pfadverweise der Doku (Plan 0027, E11)
  ["Doku", ["node", "scripts/check-docs.ts"]],
];

const COMMANDS = new Map(STEPS.map(([name, cmd]) => [name, cmd.join(" ")]));
const started = performance.now();
// Unter dem Zeitlimit von verify (150 s), damit hier der hängende Schritt benannt wird (Plan 0027, E5.4).
const results = await runSteps(
  STEPS.map(([name, cmd]) => ({ name, cmd })),
  { timeoutMs: 140_000 },
);
const failed = results.filter((r) => !r.ok);
const seconds = ((performance.now() - started) / 1000).toFixed(1);

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}`);
for (const r of failed) {
  // Lokal nur die letzten Zeilen – genug für den Agenten, ohne den Kontext zu fluten. In CI die volle Ausgabe,
  // denn dort kann niemand nachfragen (Arch-Review Etappe 1, m2).
  const lines = r.output.trim().split("\n");
  const shown = process.env["CI"] ? lines : lines.slice(-40);
  const more =
    shown.length < lines.length
      ? `\n… ${lines.length - shown.length} Zeilen gekürzt, voll: ${COMMANDS.get(r.name) ?? r.name}`
      : "";
  console.error(`\n── ${r.name} fehlgeschlagen ──\n${shown.join("\n")}${more}`);
}
const timedOut = failed.some((r) => r.timedOut);
console.log(`check:fast ${failed.length === 0 ? "grün" : timedOut ? "ROT (Zeitlimit)" : "ROT"} in ${seconds}s`);
process.exit(failed.length === 0 ? 0 : 1);
