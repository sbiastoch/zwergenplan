/**
 * Welche E2E-Specs erreicht der Diff (Plan 0029, B4)? Zum Nachsehen, kein Gate.
 *   node scripts/e2e-select.ts [--base <ref>] [--json]   Diff gegen merge-base HEAD origin/main samt Arbeitsbaum
 *   node scripts/e2e-select.ts <pfad …>                 Auswahl für genannte Pfade, ohne git diff
 * Die Regeln stehen in scripts/lib/e2e-select.ts, die Zuordnung in scripts/lib/e2e-map.ts.
 */
import { fileURLToPath } from "node:url";
import { E2E_MAP } from "./lib/e2e-map.ts";
import { LOCAL_LIMIT, localSpecs, selectSpecs } from "./lib/e2e-select.ts";
import { listFiles, localChanges, mergeBase, readGraph } from "./lib/import-graph-io.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const json = argv.includes("--json");
const baseAt = argv.indexOf("--base");
const baseArg = baseAt >= 0 ? argv[baseAt + 1] : undefined;
const paths = argv.filter((a, i) => !a.startsWith("--") && !(baseAt >= 0 && i === baseAt + 1));

const files = listFiles(ROOT, { untracked: true });
const graph = readGraph(ROOT, files);
const specFiles = files.filter((f) => /^e2e\/[^/]+\.spec\.ts$/.test(f));
const base = paths.length > 0 ? undefined : (baseArg ?? mergeBase(ROOT, "HEAD", "origin/main"));
const changed = base === undefined ? paths : localChanges(ROOT, base);
const selection = selectSpecs(changed, graph, E2E_MAP, specFiles);
const local = localSpecs(selection, changed, E2E_MAP);

if (json) {
  console.log(JSON.stringify({ base, changed, selection, local }, null, 2));
  process.exit(0);
}

console.log(`Geändert: ${changed.length} Pfade${base === undefined ? "" : ` gegen ${base.slice(0, 8)}`}`);
if (selection.kind === "none") {
  console.log("E2E: keine Spec betroffen");
  process.exit(0);
}
if (selection.kind === "full") console.log(`E2E: volle Suite (${selection.reason})`);
console.log(`Geräte-Specs (${selection.device.length}):`);
for (const spec of selection.device) console.log(`  ${spec}  ← ${selection.why[spec]}`);
console.log(`Smoke-Specs (${selection.smoke.length}):`);
for (const spec of selection.smoke) console.log(`  ${spec}  ← ${selection.why[spec]}`);
console.log(`Lokal (--affected, höchstens ${LOCAL_LIMIT}): ${local.run.join(" ") || "–"}`);
if (local.rest.length > 0) console.log(`Nur in der CI: ${local.rest.join(" ")}`);
