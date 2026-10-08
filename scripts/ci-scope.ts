/**
 * CI-Job `scope` (Plan 0027, E10; ADR 0021, Teil B): Muss dieser Lauf voll prüfen (`full=true`), oder kamen seit einem
 * voll grün geprüften Stand nur Doku-Dateien dazu (`full=false`, nur `check`, kein E2E, kein Deploy)?
 * Die Entscheidung liegt rein in lib/ci-scope.ts, Git in lib/ci-scope-git.ts; hier nur HTTP und $GITHUB_OUTPUT.
 *
 * Läuft ohne `pnpm install`, deshalb nur Node-Builtins und reine Module aus scripts/lib (Regel
 * `ci-scope-builtins-only` in .dependency-cruiser.cjs).
 * Eingaben aus der Umgebung: GITHUB_EVENT_NAME, GITHUB_REF, GITHUB_SHA, CI_BEFORE (`github.event.before`),
 * GITHUB_REPOSITORY, GITHUB_API_URL, GITHUB_TOKEN (das Token des Laufs), GITHUB_OUTPUT.
 * Jede Ausnahme zur Laufzeit ergibt `full=true` und Exit 0 (Review 2, Minor 2). Scheitert der Job selbst
 * (Checkout, Node, Import), fangen `continue-on-error` und `full || 'true'` in ci.yml das ab.
 */
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decideScope, type Scope, type ScopeIo } from "./lib/ci-scope.ts";
import { scopeGit } from "./lib/ci-scope-git.ts";

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
  ...scopeGit(ROOT),
};

let scope: Scope;
try {
  scope = await decideScope(
    { event: env("GITHUB_EVENT_NAME"), ref: env("GITHUB_REF"), sha: env("GITHUB_SHA"), before: env("CI_BEFORE") },
    io,
  );
} catch (error) {
  // decideScope wirft nicht; nur zur Sicherheit, falls sich das je ändert
  scope = { full: true, reason: `Ausnahme: ${error instanceof Error ? error.message : String(error)}` };
}

// Als Hinweis in der Zusammenfassung des Laufs sichtbar (K9)
console.log(`::notice title=Umfang::full=${scope.full} – ${scope.reason}`);
try {
  const output = env("GITHUB_OUTPUT");
  if (output === "") console.log("ci-scope: GITHUB_OUTPUT fehlt, keine Ausgabe (ci.yml nimmt dann full=true)");
  else appendFileSync(output, `full=${scope.full}\n`);
} catch (error) {
  console.log(`ci-scope: Ausgabe nicht geschrieben (${String(error)}), ci.yml nimmt dann full=true`);
}
process.exit(0);
