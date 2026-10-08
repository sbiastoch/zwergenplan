/**
 * E2E lokal unter der maschinenweiten Sperre (Plan 0027, E4, E7).
 *
 *   pnpm e2e:local e2e/detail.spec.ts [weitere Specs …] [-- <playwright-args>]   gezielt, Standard pixel-7
 *   pnpm e2e:local e2e/theme.spec.ts -- --project=iphone-15
 *   pnpm e2e [-- <playwright-args>]                                              alles (= e2e-local --all)
 *   PW_SUITE=webkit pnpm e2e -- --shard=1/2                                      einen CI-Job nachstellen
 *
 * Ablauf: Sperre nehmen (scripts/heavy.ts), freies Portpaar suchen (PW_PORT, PW_PORT + 1), bauen, dann
 * `playwright test`. Gezielt: nur `build:e2e` und PW_SUITE der Engine des Projekts (nur der Fixture-Server).
 * Alles: beide Builds, PW_SUITE aus der Umgebung oder keine. Agents starten das mit run_in_background.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { engineOf } from "../playwright.devices.ts";
import { parseE2eArgs, runPlan } from "./lib/e2e-args.ts";
import { findFreePortPair } from "./lib/free-ports.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const args = parseE2eArgs(argv);
if (args.mode === "error") {
  console.error(args.message);
  process.exit(2);
}

if (process.env["ZP_HEAVY_LOCK"] !== "1") {
  // Unter die Sperre stellen und sich selbst darin noch einmal starten
  const heavy = fileURLToPath(new URL("./heavy.ts", import.meta.url));
  const r = spawnSync("node", [heavy, "node", fileURLToPath(import.meta.url), ...argv], {
    cwd: ROOT,
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

const plan = runPlan(args, process.env["PW_SUITE"], engineOf);
if ("error" in plan) {
  console.error(plan.error);
  process.exit(2);
}
const { suite, builds } = plan;
const port = await findFreePortPair();
const env = { ...process.env, PW_PORT: String(port), PW_SUITE: suite ?? "" };
const what = args.mode === "specs" ? `${args.specs.join(" ")} auf ${args.project}` : "alle Specs";
console.log(`e2e:local: ${what} (PW_SUITE=${suite ?? "alle"}, Ports ${port}/${port + 1})`);

for (const build of builds) {
  const r = spawnSync("pnpm", [build], { cwd: ROOT, stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
// Direkt das Playwright-Binary (ein exec-Wrapper), ohne pnpm dazwischen: So erreicht ein SIGINT von heavy.ts
// Playwright selbst, und es räumt Browser und webServer ab (Arch-Review Etappe 4, m4).
const test = spawnSync(join(ROOT, "node_modules", ".bin", "playwright"), ["test", ...args.playwright], {
  cwd: ROOT,
  stdio: "inherit",
  env,
});
process.exit(test.status ?? 1);
