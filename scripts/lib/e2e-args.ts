/**
 * Argumente von scripts/e2e-local.ts (Plan 0027, E4), rein.
 *   <spec …> [-- <playwright-args>]   gezielt; ohne --project gilt pixel-7
 *   --all [--] [<playwright-args>]    alles (pnpm e2e), Argumente gehen unverändert an Playwright
 */
export type E2eArgs =
  | { mode: "specs"; specs: string[]; project: string; playwright: string[] }
  | { mode: "all"; playwright: string[] }
  | { mode: "error"; message: string };

const USAGE =
  "Aufruf: pnpm e2e:local <spec …> [-- <playwright-args>]\n" +
  "Lokal laufen nur genannte Specs. Die volle Suite fährt die CI auf jedem Branch (Plan 0027, E4).";

export function parseE2eArgs(argv: readonly string[]): E2eArgs {
  if (argv[0] === "--all") {
    const rest = argv.slice(1);
    return { mode: "all", playwright: rest[0] === "--" ? rest.slice(1) : rest };
  }
  const split = argv.indexOf("--");
  const specs = split === -1 ? [...argv] : argv.slice(0, split);
  const extra = split === -1 ? [] : argv.slice(split + 1);
  if (specs.length === 0 || specs.some((s) => s.startsWith("-"))) return { mode: "error", message: USAGE };

  const i = extra.findIndex((a) => a === "--project" || a.startsWith("--project="));
  const arg = i === -1 ? undefined : extra[i];
  const project =
    arg === undefined ? "pixel-7" : arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : (extra[i + 1] ?? "");
  return {
    mode: "specs",
    specs,
    project,
    playwright: [...specs, ...(arg === undefined ? ["--project=pixel-7"] : []), ...extra],
  };
}
