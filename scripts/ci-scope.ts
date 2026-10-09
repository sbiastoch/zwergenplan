/**
 * CI-Job `scope` (Plan 0027, E10; ADR 0021, Teil B): Muss dieser Lauf voll prüfen (`full=true`), oder kamen seit einem
 * voll grün geprüften Stand nur Doku-Dateien dazu (`full=false`, nur `check`, kein E2E, kein Deploy)?
 * Dazu die E2E-Auswahl (Plan 0029, B5; ADR 0023): auf einem Branch außer `main` nur die Specs, die der Diff erreicht
 * (`e2e=select` mit `specs`, `devices`, `smoke`, oder `e2e=none`), sonst `e2e=full`.
 * Die Entscheidung liegt rein in lib/ci-scope.ts, Git in lib/ci-scope-git.ts, die Auswahl in lib/e2e-select.ts;
 * hier nur HTTP und $GITHUB_OUTPUT.
 *
 * Läuft ohne `pnpm install`, deshalb nur Node-Builtins und reine Module aus scripts/lib (Regel
 * `ci-scope-builtins-only` in .dependency-cruiser.cjs).
 * Eingaben aus der Umgebung: GITHUB_EVENT_NAME, GITHUB_REF, GITHUB_SHA, CI_BEFORE (`github.event.before`),
 * GITHUB_REPOSITORY, GITHUB_API_URL, GITHUB_TOKEN (das Token des Laufs), GITHUB_OUTPUT.
 * Jede Ausnahme zur Laufzeit ergibt `full=true` bzw. `e2e=full` und Exit 0 (Review 2, Minor 2). Scheitert der Job
 * selbst (Checkout, Node, Import), fangen `continue-on-error` und die Rückfallwerte in ci.yml das ab.
 */
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  decideE2e,
  decideScope,
  type E2eIo,
  type E2eScope,
  type Scope,
  type ScopeIo,
  scopeOutputs,
} from "./lib/ci-scope.ts";
import { scopeGit } from "./lib/ci-scope-git.ts";
import { E2E_MAP } from "./lib/e2e-map.ts";
import { selectSpecs } from "./lib/e2e-select.ts";
import { listFiles, readGraph } from "./lib/import-graph-io.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// je API-Aufruf (Plan 0027, E10)
const API_TIMEOUT_MS = 10_000;

function env(name: string): string {
  return process.env[name] ?? "";
}

function required(name: string): string {
  const value = env(name);
  if (value === "") throw new Error(`${name} fehlt`);
  return value;
}

const git = scopeGit(ROOT);
const io: ScopeIo = {
  async api(path) {
    const url = `${env("GITHUB_API_URL") || "https://api.github.com"}/repos/${required("GITHUB_REPOSITORY")}/${path}`;
    const response = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${required("GITHUB_TOKEN")}`,
        "user-agent": "zwergenplan-ci-scope",
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} für ${path}`);
    return await response.text();
  },
  ...git,
};

const event = {
  event: env("GITHUB_EVENT_NAME"),
  ref: env("GITHUB_REF"),
  sha: env("GITHUB_SHA"),
  before: env("CI_BEFORE"),
};
let scope: Scope;
try {
  scope = await decideScope(event, io);
} catch (error) {
  // decideScope wirft nicht; nur zur Sicherheit, falls sich das je ändert
  scope = { full: true, reason: `Ausnahme: ${error instanceof Error ? error.message : String(error)}` };
}

// E2E nach Diff nur bei vollem Lauf: Beim Doku-Pfad laufen E2E und Smoke ohnehin nicht.
const e2eIo: E2eIo = {
  ...git,
  select(changed) {
    const files = listFiles(ROOT);
    const specFiles = files.filter((f) => /^e2e\/[^/]+\.spec\.ts$/.test(f));
    return selectSpecs(changed, readGraph(ROOT, files), E2E_MAP, specFiles);
  },
};
const e2e: E2eScope = scope.full
  ? decideE2e(event, e2eIo)
  : { e2e: "full", specs: [], devices: true, smoke: true, reason: "Doku-Pfad, kein E2E" };

// Als Hinweis in der Zusammenfassung des Laufs sichtbar (K9)
console.log(`::notice title=Umfang::full=${scope.full} – ${scope.reason}`);
const specList = e2e.specs.length > 0 ? ` – ${e2e.specs.join(" ")}` : "";
console.log(
  `::notice title=E2E-Auswahl::e2e=${e2e.e2e} devices=${e2e.devices} smoke=${e2e.smoke} – ${e2e.reason}${specList}`,
);
try {
  const output = env("GITHUB_OUTPUT");
  if (output === "")
    console.log("ci-scope: GITHUB_OUTPUT fehlt, keine Ausgabe (ci.yml nimmt dann full=true, e2e=full)");
  else appendFileSync(output, scopeOutputs(scope, e2e));
} catch (error) {
  console.log(`ci-scope: Ausgabe nicht geschrieben (${String(error)}), ci.yml nimmt dann full=true, e2e=full`);
}
process.exit(0);
