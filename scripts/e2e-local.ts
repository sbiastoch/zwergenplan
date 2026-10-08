/**
 * E2E lokal unter der maschinenweiten Sperre (Plan 0027, E4, E7; Plan 0029, B5).
 *
 *   pnpm e2e:local --affected [--smoke] [--base <ref>] [-- <playwright-args>]  Specs aus dem Diff, Standard pixel-7
 *   pnpm e2e:local e2e/detail.spec.ts [weitere Specs …] [-- <playwright-args>]   gezielt, Standard pixel-7
 *   pnpm e2e:local e2e/theme.spec.ts -- --project=iphone-15
 *   pnpm e2e [-- <playwright-args>]                                              alles (= e2e-local --all)
 *   PW_SUITE=webkit pnpm e2e -- --shard=1/2                                      einen CI-Job nachstellen
 *
 * Ablauf: Sperre nehmen (scripts/heavy.ts), freies Portpaar suchen (PW_PORT, PW_PORT + 1), bauen, dann
 * `playwright test`. Gezielt: nur `build:e2e` und PW_SUITE der Engine des Projekts (nur der Fixture-Server).
 * Alles: beide Builds, PW_SUITE aus der Umgebung oder keine. Agents starten das mit run_in_background.
 *
 * `--affected` wählt die Specs aus dem Diff gegen `merge-base HEAD origin/main` samt Arbeitsbaum (e2e-select.ts).
 * Lokal laufen höchstens 8 Geräte-Specs, bei einer vollen Auswahl dazu die Stellvertreter; den Rest prüft die CI
 * (ADR 0021, Nr. 5). Smoke-Specs laufen nur mit `--smoke`, denn sie brauchen den Deploy-Build (Review 2, m7).
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { engineOf } from "../playwright.devices.ts";
import { affectedArgs, type E2eArgs, parseE2eArgs, runPlan } from "./lib/e2e-args.ts";
import { E2E_MAP } from "./lib/e2e-map.ts";
import { LOCAL_LIMIT, localSpecs, selectSpecs } from "./lib/e2e-select.ts";
import { findFreePortPair } from "./lib/free-ports.ts";
import { listFiles, localChanges, readGraph, resolveBase } from "./lib/import-graph-io.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const parsed = parseE2eArgs(argv);
if (parsed.mode === "error") {
  console.error(parsed.message);
  process.exit(2);
}
const locked = process.env["ZP_HEAVY_LOCK"] === "1";

/** `--affected`: Auswahl berechnen; ohne Spec endet der Lauf hier, noch ohne Sperre. */
function resolveAffected(a: Extract<E2eArgs, { mode: "affected" }>) {
  const resolved = resolveBase(ROOT, a.base);
  if ("error" in resolved) {
    console.error(`e2e:local --affected: ${resolved.error}`);
    process.exit(2);
  }
  const { base } = resolved;
  const files = listFiles(ROOT, { untracked: true });
  const changed = localChanges(ROOT, base);
  const specFiles = files.filter((f) => /^e2e\/[^/]+\.spec\.ts$/.test(f));
  const selection = selectSpecs(changed, readGraph(ROOT, files), E2E_MAP, specFiles);
  const local = localSpecs(selection, changed, E2E_MAP);
  const smoke = selection.kind === "none" ? [] : selection.smoke;
  const lines = [`e2e:local --affected: ${changed.length} geänderte Pfade gegen ${base.slice(0, 8)}`];
  if (selection.kind === "full") {
    lines.push(`volle Auswahl (${selection.reason}), lokal nur Auswahl plus Stellvertreter, den Rest prüft die CI`);
  }
  if (local.run.length > 0) lines.push(`lokal (höchstens ${LOCAL_LIMIT}): ${local.run.join(" ")}`);
  if (local.rest.length > 0) lines.push(`nur in der CI: ${local.rest.join(" ")}`);
  if (smoke.length > 0) {
    lines.push(a.smoke ? `Smoke: ${smoke.join(" ")}` : `Smoke nur mit --smoke, sonst in der CI: ${smoke.join(" ")}`);
  }
  return { run: local.run, smoke: a.smoke ? smoke : [], lines };
}

const affected = parsed.mode === "affected" ? resolveAffected(parsed) : undefined;
if (affected !== undefined && affected.run.length === 0 && affected.smoke.length === 0) {
  for (const line of affected.lines) console.log(line);
  console.log("e2e:local: keine Spec lokal zu fahren");
  process.exit(0);
}

if (!locked) {
  // Unter die Sperre stellen und sich selbst darin noch einmal starten
  const heavy = fileURLToPath(new URL("./heavy.ts", import.meta.url));
  const r = spawnSync("node", [heavy, "node", fileURLToPath(import.meta.url), ...argv], {
    cwd: ROOT,
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

if (affected !== undefined) for (const line of affected.lines) console.log(line);
const port = await findFreePortPair();
// Direkt das Playwright-Binary (ein exec-Wrapper), ohne pnpm dazwischen: So erreicht ein SIGINT von heavy.ts
// Playwright selbst, und es räumt Browser und webServer ab (Arch-Review Etappe 4, m4).
const PLAYWRIGHT = join(ROOT, "node_modules", ".bin", "playwright");

function run(label: string, suite: string | undefined, builds: string[], playwright: string[]): number {
  const env = { ...process.env, PW_PORT: String(port), PW_SUITE: suite ?? "" };
  console.log(`e2e:local: ${label} (PW_SUITE=${suite ?? "alle"}, Ports ${port}/${port + 1})`);
  for (const build of builds) {
    const r = spawnSync("pnpm", [build], { cwd: ROOT, stdio: "inherit", env });
    if (r.status !== 0) return r.status ?? 1;
  }
  return spawnSync(PLAYWRIGHT, ["test", ...playwright], { cwd: ROOT, stdio: "inherit", env }).status ?? 1;
}

const args =
  parsed.mode === "affected"
    ? affectedArgs(affected?.run ?? [], { project: parsed.project, extra: parsed.extra })
    : parsed;
let status = 0;
if (args.mode === "all" || args.specs.length > 0) {
  const plan = runPlan(args, process.env["PW_SUITE"], engineOf);
  if ("error" in plan) {
    console.error(plan.error);
    process.exit(2);
  }
  const what = args.mode === "specs" ? `${args.specs.join(" ")} auf ${args.project}` : "alle Specs";
  status = run(what, plan.suite, plan.builds, args.playwright);
}
const smoke = affected?.smoke ?? [];
if (status === 0 && smoke.length > 0) status = run(`Smoke ${smoke.join(" ")}`, "smoke", ["build"], smoke);
process.exit(status);
