/**
 * Schnelle Gates (< 15 s): Typen, Lint, Architektur, Daten, Unit-Tests.
 * Läuft im Stop-Hook, im pre-commit-Hook und als erster CI-Schritt.
 * Alle Schritte laufen parallel; Ausgabe nur für fehlgeschlagene Schritte.
 */
import { spawn } from "node:child_process";

const STEPS: Array<[name: string, cmd: string[]]> = [
  ["Typen", ["pnpm", "exec", "tsc", "--noEmit", "-p", "."]],
  // Service Worker mit lib „webworker“, getrennt vom Haupt-tsconfig (Plan 0011, E3)
  ["Typen SW", ["pnpm", "exec", "tsc", "--noEmit", "-p", "src/sw"]],
  // Cloudflare Worker der Push-Abos mit Workers-Typen (Plan 0011, E11; Plan 0017)
  ["Typen Worker", ["pnpm", "exec", "tsc", "--noEmit", "-p", "push-worker"]],
  ["Lint", ["pnpm", "exec", "biome", "check", "."]],
  ["Architektur", ["node", "scripts/check-architecture.ts"]],
  ["Daten", ["node", "scripts/validate-data.ts"]],
  ["Unit-Tests", ["pnpm", "exec", "vitest", "run", "--reporter=dot"]],
];

const started = performance.now();

function run([name, [cmd, ...args]]: [string, string[]]): Promise<{ name: string; ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd ?? "", args, { env: { ...process.env, FORCE_COLOR: "0" } });
    let output = "";
    child.stdout.on("data", (d) => {
      output += d;
    });
    child.stderr.on("data", (d) => {
      output += d;
    });
    child.on("close", (code) => resolve({ name, ok: code === 0, output }));
  });
}

const results = await Promise.all(STEPS.map(run));
const failed = results.filter((r) => !r.ok);
const seconds = ((performance.now() - started) / 1000).toFixed(1);

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}`);
for (const r of failed) {
  // Nur die letzten Zeilen – genug für den Agenten, ohne den Kontext zu fluten.
  const tail = r.output.trim().split("\n").slice(-40).join("\n");
  console.error(`\n── ${r.name} fehlgeschlagen ──\n${tail}`);
}
console.log(`check:fast ${failed.length === 0 ? "grün" : "ROT"} in ${seconds}s`);
process.exit(failed.length === 0 ? 0 : 1);
