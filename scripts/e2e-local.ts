/**
 * E2E lokal, gezielt (Plan 0027, E4): nur genannte Specs, standardmäßig auf pixel-7, unter der maschinenweiten Sperre.
 *
 *   pnpm e2e:local e2e/detail.spec.ts [weitere Specs …] [-- <playwright-args>]
 *   pnpm e2e:local e2e/theme.spec.ts -- --project=iphone-15
 *
 * Ablauf: Sperre nehmen (scripts/heavy.ts), freies Portpaar suchen, `pnpm build:e2e`, dann `playwright test` mit
 * PW_PORT, PW_SUITE (nur der Fixture-Server) und dem Projekt. Die volle Suite fährt die CI auf jedem Branch.
 * Agents starten das Skript mit run_in_background (CLAUDE.md, Stolperfallen).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findFreePortPair } from "./lib/free-ports.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// Geräte mit WebKit; alle anderen sind Chromium. Ein falscher Name lässt Playwright laut abbrechen
// („Project(s) … not found“), weil PW_SUITE dann ein anderes Projekt auswählt.
const WEBKIT_PROJECTS = new Set(["iphone-15"]);

const argv = process.argv.slice(2);
const split = argv.indexOf("--");
const specs = split === -1 ? argv : argv.slice(0, split);
const extra = split === -1 ? [] : argv.slice(split + 1);

if (specs.length === 0 || specs.some((s) => s.startsWith("-"))) {
  console.error(
    "Aufruf: pnpm e2e:local <spec …> [-- <playwright-args>]\n" +
      "Lokal laufen nur genannte Specs. Die volle Suite fährt die CI auf jedem Branch (Plan 0027, E4).",
  );
  process.exit(2);
}

if (process.env["ZP_HEAVY_LOCK"] !== "1") {
  // Unter die Sperre stellen und sich selbst darin noch einmal starten
  const r = spawnSync(
    "node",
    [fileURLToPath(new URL("./heavy.ts", import.meta.url)), "node", fileURLToPath(import.meta.url), ...argv],
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );
  process.exit(r.status ?? 1);
}

const projectArg = extra.find((a) => a.startsWith("--project"));
const project =
  projectArg === undefined
    ? "pixel-7"
    : projectArg.includes("=")
      ? projectArg.slice(projectArg.indexOf("=") + 1)
      : (extra[extra.indexOf(projectArg) + 1] ?? "pixel-7");
const suite = WEBKIT_PROJECTS.has(project) ? "webkit" : "chromium";
const port = await findFreePortPair();
const env = { ...process.env, PW_PORT: String(port), PW_SUITE: suite };
console.log(`e2e:local: ${specs.join(" ")} auf ${project} (PW_SUITE=${suite}, Port ${port})`);

const build = spawnSync("pnpm", ["build:e2e"], { cwd: ROOT, stdio: "inherit", env });
if (build.status !== 0) process.exit(build.status ?? 1);

const args = [
  "exec",
  "playwright",
  "test",
  ...specs,
  ...(projectArg === undefined ? ["--project=pixel-7"] : []),
  ...extra,
];
const test = spawnSync("pnpm", args, { cwd: ROOT, stdio: "inherit", env });
process.exit(test.status ?? 1);
