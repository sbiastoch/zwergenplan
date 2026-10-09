/**
 * Argumente von scripts/e2e-local.ts (Plan 0027, E4; Plan 0029, B5), rein.
 *   <spec …> [-- <playwright-args>]                            gezielt; ohne --project gilt pixel-7
 *   --affected [--smoke] [--base <ref>] [-- <playwright-args>]  Specs aus dem Diff (e2e-select.ts)
 *   --all [--] [<playwright-args>]                             alles (pnpm e2e), Argumente gehen unverändert an Playwright
 */
export type E2eArgs =
  | { mode: "specs"; specs: string[]; project: string; playwright: string[] }
  | { mode: "affected"; project: string; smoke: boolean; base: string | undefined; extra: string[] }
  | { mode: "all"; playwright: string[] }
  | { mode: "error"; message: string };

const USAGE =
  "Aufruf: pnpm e2e:local --affected [--smoke] | <spec …> [-- <playwright-args>]\n" +
  "Lokal laufen nur gewählte oder genannte Specs. Die volle Suite fährt die CI auf main vor dem Deploy (ADR 0023).";

/**
 * Suite und Builds eines Laufs (Arch-Review e6, m8). Gezielt: PW_SUITE ist die Engine des Projekts, gebaut wird nur
 * `build:e2e` (nur Fixture-Server). Alles: PW_SUITE aus der Umgebung; chromium/webkit brauchen nur `build:e2e`,
 * ohne Suite oder mit `smoke` braucht es auch den Deploy-Build (`build`).
 */
export function runPlan(
  args: Extract<E2eArgs, { mode: "specs" | "all" }>,
  envSuite: string | undefined,
  engineOf: (project: string) => string | undefined,
): { suite: string | undefined; builds: string[] } | { error: string } {
  if (args.mode === "specs") {
    const suite = engineOf(args.project);
    if (suite === undefined) return { error: `Unbekanntes Projekt „${args.project}“ (Geräte: playwright.devices.ts)` };
    return { suite, builds: ["build:e2e"] };
  }
  const suite = envSuite || undefined;
  return { suite, builds: suite === "chromium" || suite === "webkit" ? ["build:e2e"] : ["build:e2e", "build"] };
}

/** Projekt aus `--project=x` oder `--project x`, sonst pixel-7. */
function projectOf(extra: readonly string[]): { project: string; given: boolean } {
  const i = extra.findIndex((a) => a === "--project" || a.startsWith("--project="));
  const arg = i === -1 ? undefined : extra[i];
  if (arg === undefined) return { project: "pixel-7", given: false };
  return { project: arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : (extra[i + 1] ?? ""), given: true };
}

/** Gezielter Lauf für genannte oder von `--affected` gewählte Specs. */
export function affectedArgs(
  specs: readonly string[],
  { project, extra }: { project: string; extra: readonly string[] },
): Extract<E2eArgs, { mode: "specs" }> {
  const { given } = projectOf(extra);
  return {
    mode: "specs",
    specs: [...specs],
    project,
    playwright: [...specs, ...(given ? [] : [`--project=${project}`]), ...extra],
  };
}

function parseAffected(argv: readonly string[]): E2eArgs {
  const split = argv.indexOf("--");
  const own = split === -1 ? argv.slice(1) : argv.slice(1, split);
  const extra = split === -1 ? [] : argv.slice(split + 1);
  let smoke = false;
  let base: string | undefined;
  for (let i = 0; i < own.length; i++) {
    const arg = own[i];
    const next = own[i + 1];
    if (arg === "--smoke") {
      smoke = true;
    } else if (arg === "--base" && next !== undefined && !next.startsWith("-")) {
      base = next;
      i++;
    } else {
      return {
        mode: "error",
        message: `--affected: unbekanntes Argument „${arg}“, Specs nicht zusätzlich nennen\n${USAGE}`,
      };
    }
  }
  return { mode: "affected", project: projectOf(extra).project, smoke, base, extra };
}

export function parseE2eArgs(argv: readonly string[]): E2eArgs {
  if (argv[0] === "--all") {
    const rest = argv.slice(1);
    return { mode: "all", playwright: rest[0] === "--" ? rest.slice(1) : rest };
  }
  if (argv[0] === "--affected") return parseAffected(argv);
  const split = argv.indexOf("--");
  const specs = split === -1 ? [...argv] : argv.slice(0, split);
  const extra = split === -1 ? [] : argv.slice(split + 1);
  if (specs.length === 0 || specs.some((s) => s.startsWith("-"))) return { mode: "error", message: USAGE };
  return affectedArgs(specs, { project: projectOf(extra).project, extra });
}
