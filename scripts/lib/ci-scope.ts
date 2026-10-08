/**
 * Entscheidung des CI-Jobs `scope` (Plan 0027, E10; ADR 0021, Teil B), rein: Git und GitHub-API kommen als
 * Eingaben (`ScopeIo`). `full=false` heißt: Seit einem voll grün geprüften Stand kamen nur Dateien der
 * Doku-Positivliste dazu (change-class.ts). Dann fährt die CI nur `check`, ohne E2E, Smoke und Deploy.
 *
 * - `main`: Vergleich mit dem **live ausgelieferten** Commit, nicht mit dem Vorgänger. Ein wartender Code-Lauf,
 *   den ein Doku-Commit abbricht, war nie live; sein Diff landet so im Vergleich (Review B2).
 * - andere Branches: Vergleich mit `before`, wenn es dafür einen grünen Push-Lauf von ci.yml auf derselben Ref gibt.
 * - alles andere (neuer Branch, pull_request, workflow_dispatch, Tag) und jede Unsicherheit oder Ausnahme:
 *   `full=true`. Ein Fehler hier führt nie zu Rot, nur zu mehr Prüfung (Review 2, Minor 2).
 *
 * Höchstens zwei API-Abfragen je Lauf (E13): auf `main` Deployments und die Statuses des neuesten, auf Branches
 * die Läufe von `before`. Deshalb zählt auf `main` nur das neueste Deployment: Ist sein letzter Status nicht
 * `success` (Deploy läuft, gescheitert oder abgelöst), gilt `full=true`, statt ältere Deployments abzufragen.
 */
import { classify } from "./change-class.ts";
import type { Selection } from "./e2e-select.ts";

export interface ScopeEvent {
  /** GITHUB_EVENT_NAME */
  event: string;
  /** GITHUB_REF, z. B. `refs/heads/main` */
  ref: string;
  /** GITHUB_SHA */
  sha: string;
  /** `github.event.before`; leer bei anderen Ereignissen, 40 Nullen bei einem neuen Branch */
  before: string;
}

export interface ScopeIo {
  /**
   * GET auf `repos/<owner>/<repo>/<path>` mit dem GITHUB_TOKEN des Laufs. Liefert den Rumpf. Wirft bei Netzfehler,
   * Status außerhalb 2xx und Zeitüberschreitung.
   */
  api(path: string): Promise<string>;
  /** `git merge-base --is-ancestor <from> <to>`; wirft bei unbekanntem Objekt. */
  isAncestor(from: string, to: string): boolean;
  /** `git diff --name-only --no-renames <from> <to>`; wirft bei unbekanntem Objekt. */
  changedPaths(from: string, to: string): string[];
}

export interface Scope {
  full: boolean;
  /** Grund für das Log des Laufs */
  reason: string;
}

const MAIN_REF = "refs/heads/main";
const BRANCH_PREFIX = "refs/heads/";
// Workflow-Datei, deren Läufe für `before` zählen; heißt sie anders, antwortet die API mit 404 → full=true.
const WORKFLOW = "ci.yml";
const FULL_SHA = /^[0-9a-f]{40}$/;
const NULL_SHA = /^0{40}$/;

const full = (reason: string): Scope => ({ full: true, reason });
const short = (sha: string) => sha.slice(0, 7);

/** Entscheidet `full`; wirft nie. Jede Ausnahme ergibt `full=true` mit dem Grund. */
export async function decideScope(event: ScopeEvent, io: ScopeIo): Promise<Scope> {
  try {
    return await decide(event, io);
  } catch (error) {
    return full(`Ausnahme: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function decide({ event, ref, sha, before }: ScopeEvent, io: ScopeIo): Promise<Scope> {
  if (event !== "push") return full(`Ereignis ${event || "unbekannt"}`);
  if (!FULL_SHA.test(sha)) return full(`SHA des Laufs ungültig: ${sha}`);
  if (!ref.startsWith(BRANCH_PREFIX)) return full(`kein Branch: ${ref}`);

  if (ref === MAIN_REF) {
    const live = await liveCommit(io);
    if (typeof live !== "string") return live;
    return docsOnlySince(live, sha, `live ${short(live)}`, io);
  }

  if (!FULL_SHA.test(before) || NULL_SHA.test(before)) return full("neuer Branch oder kein Vorgänger");
  // Git zuerst: kostet keine API-Abfrage und entscheidet die meisten Läufe.
  const diff = docsOnlySince(before, sha, `Vorgänger ${short(before)}`, io);
  if (diff.full) return diff;
  const branch = ref.slice(BRANCH_PREFIX.length);
  const green = await greenPushRun(io, before, branch);
  return green ? diff : full(`kein grüner Push-Lauf für ${short(before)} auf ${branch}`);
}

/** Voller SHA des live ausgelieferten Commits oder der Grund, warum er nicht sicher feststeht. */
async function liveCommit(io: ScopeIo): Promise<string | Scope> {
  const list = parseJson(await io.api("deployments?environment=github-pages&per_page=10"), "Deployments");
  const newest = latest(Array.isArray(list) ? list : []);
  if (newest === undefined) return full("kein Deployment in github-pages");
  const sha = newest["sha"];
  if (typeof sha !== "string" || !FULL_SHA.test(sha)) return full(`Live-SHA ungültig: ${String(sha)}`);
  const statuses = parseJson(await io.api(`deployments/${newest["id"]}/statuses?per_page=100`), "Statuses");
  const state = latest(Array.isArray(statuses) ? statuses : [])?.["state"];
  if (state !== "success") return full(`neuestes Deployment ${newest["id"]} hat Status ${String(state)}`);
  return sha;
}

/** Gibt es für `before` einen grünen Lauf von ci.yml, ausgelöst per Push auf genau diesen Branch? */
async function greenPushRun(io: ScopeIo, before: string, branch: string): Promise<boolean> {
  const query = `event=push&branch=${encodeURIComponent(branch)}&head_sha=${before}&per_page=20`;
  const body = parseJson(await io.api(`actions/workflows/${WORKFLOW}/runs?${query}`), "Läufe");
  const runs = isRecord(body) && Array.isArray(body["workflow_runs"]) ? body["workflow_runs"] : [];
  return runs.some(
    (run) =>
      isRecord(run) &&
      run["head_sha"] === before &&
      run["head_branch"] === branch &&
      run["event"] === "push" &&
      run["conclusion"] === "success",
  );
}

function docsOnlySince(from: string, to: string, label: string, io: ScopeIo): Scope {
  if (!io.isAncestor(from, to)) return full(`${label} ist kein Vorfahre von ${short(to)}`);
  const paths = io.changedPaths(from, to);
  const { tier, reason } = classify(paths);
  return tier === "0"
    ? { full: false, reason: `nur Doku seit ${label} (${paths.length} Dateien)` }
    : full(`${reason} geändert seit ${label}`);
}

/** Eintrag mit der höchsten numerischen `id`, unabhängig von der Sortierung der Antwort. */
function latest(list: readonly unknown[]): Record<string, unknown> | undefined {
  let best: Record<string, unknown> | undefined;
  let bestId = Number.NEGATIVE_INFINITY;
  for (const item of list) {
    if (!isRecord(item) || typeof item["id"] !== "number" || item["id"] <= bestId) continue;
    best = item;
    bestId = item["id"];
  }
  return best;
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what}: Antwort ist kein JSON`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * E2E nach Diff (Plan 0029, B5; ADR 0023): Nur bei `push` auf einen Branch außer `main` fährt die CI eine Auswahl.
 * Der Diff läuft von `merge-base origin/main HEAD` bis HEAD, also über den ganzen Branch. Auf `main`, bei Pull
 * Requests, `workflow_dispatch` und bei jedem Fehler gilt `e2e=full`, nie Rot.
 */
export interface E2eIo {
  /** `git merge-base <a> <b>`; wirft, wenn es einen der beiden nicht gibt (etwa `origin/main`). */
  mergeBase(a: string, b: string): string;
  /** wie ScopeIo.changedPaths */
  changedPaths(from: string, to: string): string[];
  /** Auswahl für die geänderten Pfade (e2e-select.ts mit dem Graphen des Checkouts) */
  select(changed: string[]): Selection;
}

export interface E2eScope {
  e2e: "full" | "select" | "none";
  /** Geräte-Specs, nur bei `select` */
  specs: string[];
  /** Gibt es Geräte-Specs? Sonst überspringt die CI den Job e2e (Review B1). */
  devices: boolean;
  /** Laufen die Smoke-Specs? */
  smoke: boolean;
  reason: string;
}

// Die Spec-Liste landet in einer Shell (ci.yml, `$SPECS` ohne Anführungszeichen): nur harmlose Namen (Review m3).
const SPEC_NAME = /^e2e\/[a-z0-9.-]+\.spec\.ts$/;

const fullE2e = (reason: string): E2eScope => ({ e2e: "full", specs: [], devices: true, smoke: true, reason });

/** Entscheidet `e2e`; wirft nie. */
export function decideE2e({ event, ref, sha }: ScopeEvent, io: E2eIo): E2eScope {
  if (event !== "push") return fullE2e(`Ereignis ${event || "unbekannt"}`);
  if (ref === MAIN_REF) return fullE2e("main: volle Suite vor dem Deploy");
  if (!ref.startsWith(BRANCH_PREFIX)) return fullE2e(`kein Branch: ${ref}`);
  if (!FULL_SHA.test(sha)) return fullE2e(`SHA des Laufs ungültig: ${sha}`);
  try {
    const base = io.mergeBase("origin/main", sha);
    const changed = io.changedPaths(base, sha);
    const selection = io.select(changed);
    const since = `seit ${short(base)} (${changed.length} Dateien)`;
    if (selection.kind === "none") {
      return { e2e: "none", specs: [], devices: false, smoke: false, reason: `keine Spec betroffen ${since}` };
    }
    if (selection.kind === "full") return fullE2e(`${selection.reason} ${since}`);
    const bad = selection.device.find((s) => !SPEC_NAME.test(s));
    if (bad !== undefined) return fullE2e(`Spec-Name außerhalb des Musters: ${bad}`);
    return {
      e2e: "select",
      specs: selection.device,
      devices: selection.device.length > 0,
      smoke: selection.smoke.length > 0,
      reason: `${selection.device.length} Geräte-Specs, ${selection.smoke.length} Smoke-Specs ${since}`,
    };
  } catch (error) {
    return fullE2e(`Ausnahme: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Alle Ausgaben für $GITHUB_OUTPUT in einem String, damit sie in einem Schreibvorgang landen (Review 2, m4). */
export function scopeOutputs(scope: Scope, e2e: E2eScope): string {
  return [
    `full=${scope.full}`,
    `e2e=${e2e.e2e}`,
    `specs=${e2e.specs.join(" ")}`,
    `devices=${e2e.devices}`,
    `smoke=${e2e.smoke}`,
    "",
  ].join("\n");
}
