/**
 * CI-Job `gates` (Plan 0029, B5): prüft die Ergebnisse aller Jobs, Entscheidung rein in lib/ci-gates.ts.
 * Eingaben aus der Umgebung (ci.yml): REF, FULL, E2E_MODE, DEVICES, SMOKE_MODE und R_SCOPE, R_CHECK, R_E2E, R_SMOKE.
 * Läuft ohne `pnpm install`, deshalb nur Node-Builtins und reine Module (`ci-scope-builtins-only`).
 */
import { decideGates, type GatesInput } from "./lib/ci-gates.ts";

const env = (name: string) => process.env[name] ?? "";

const input: GatesInput = {
  ref: env("REF"),
  full: env("FULL"),
  e2e: env("E2E_MODE"),
  devices: env("DEVICES"),
  smoke: env("SMOKE_MODE"),
  results: { scope: env("R_SCOPE"), check: env("R_CHECK"), e2e: env("R_E2E"), smoke: env("R_SMOKE") },
};
const { results: r, ...scope } = input;
console.log(
  `ref=${scope.ref} full=${scope.full} e2e=${scope.e2e} devices=${scope.devices} smoke=${scope.smoke} | ` +
    `scope=${r.scope} check=${r.check} e2e=${r.e2e} smoke=${r.smoke}`,
);
const decision = decideGates(input);
if (decision.ok) {
  console.log(decision.message);
} else {
  console.log(`::error::${decision.message}`);
  process.exit(1);
}
