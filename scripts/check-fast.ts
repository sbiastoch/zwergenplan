/**
 * Schnelle Gates: Typen, Lint, Architektur, Daten, Unit-Tests, tote Pfade, Schema-Drift.
 * Gemessen 2026-10-08: lokal etwa 6 s (16 Kerne), in CI 9 s (Plan 0027, Ergebnis).
 * Läuft im Stop-Hook, im pre-commit-Hook und als erster CI-Schritt.
 * Alle Schritte laufen parallel; Ausgabe nur für fehlgeschlagene Schritte.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { staleInstall } from "./lib/install-state.ts";

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
];

const started = performance.now();

function run([name, [cmd, ...args]]: [string, string[]]): Promise<{
  name: string;
  ok: boolean;
  output: string;
  cmd: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(cmd ?? "", args, { env: { ...process.env, FORCE_COLOR: "0" } });
    let output = "";
    child.stdout.on("data", (d) => {
      output += d;
    });
    child.stderr.on("data", (d) => {
      output += d;
    });
    child.on("close", (code) => resolve({ name, ok: code === 0, output, cmd: [cmd ?? "", ...args].join(" ") }));
  });
}

const results = await Promise.all(STEPS.map(run));
const failed = results.filter((r) => !r.ok);
const seconds = ((performance.now() - started) / 1000).toFixed(1);

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}`);
for (const r of failed) {
  // Lokal nur die letzten Zeilen – genug für den Agenten, ohne den Kontext zu fluten. In CI die volle Ausgabe,
  // denn dort kann niemand nachfragen (Arch-Review Etappe 1, m2).
  const lines = r.output.trim().split("\n");
  const shown = process.env["CI"] ? lines : lines.slice(-40);
  const more = shown.length < lines.length ? `\n… ${lines.length - shown.length} Zeilen gekürzt, voll: ${r.cmd}` : "";
  console.error(`\n── ${r.name} fehlgeschlagen ──\n${shown.join("\n")}${more}`);
}
console.log(`check:fast ${failed.length === 0 ? "grün" : "ROT"} in ${seconds}s`);
process.exit(failed.length === 0 ? 0 : 1);
