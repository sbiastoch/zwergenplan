/**
 * `pipeline publish RUN_DIR` nach dem Nachtlauf (Plan 0032, E6): prüft, committet den Zustand des Laufs und pusht
 * nach `main`. Vor dem Push `pull --rebase`; ein Konflikt bricht ohne Push ab (Workflow rot). Committet werden nur
 * `data/raw/`, `data/offers.json` und `data/kosten.csv`; jede andere Änderung im Arbeitsbaum bricht ab.
 * Das Token für den Push setzt der Workflow nur für diesen Schritt (`persist-credentials: false`).
 */

/** git im Projekt; wirft bei Exit-Code ≠ 0 (wie `execFileSync`) */
export type Git = (args: string[]) => string;

const NIGHTLY_PATHS = ["data/raw", "data/offers.json", "data/kosten.csv"] as const;

const inNightlyPaths = (path: string) => NIGHTLY_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

/** Geänderte und neue Dateien im Arbeitsbaum (ohne Statusspalten, die ein `trim` der Ausgabe verfälschen würde) */
export function changedPaths(git: Git): string[] {
  const tracked = git(["diff", "--name-only", "--no-renames", "HEAD"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return `${tracked}\n${untracked}`.split("\n").filter((l) => l.trim() !== "");
}

export function publishNightly(o: { git: Git; message: string; validate: () => void }): { pushed: boolean } {
  const { git } = o;
  if (git(["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") throw new Error("publish nur auf main (ADR 0002)");
  const foreign = changedPaths(git).filter((p) => !inNightlyPaths(p));
  if (foreign.length > 0)
    throw new Error(`Änderungen außerhalb der Daten des Nachtlaufs, nichts committet:\n  ${foreign.join("\n  ")}`);
  o.validate();
  // alle Änderungen liegen in NIGHTLY_PATHS (oben geprüft); `data` statt der Liste, weil fehlende Pfade git stören
  git(["add", "-A", "--", "data"]);
  const staged = git(["diff", "--cached", "--name-only"]).split("\n").filter(Boolean);
  if (staged.length === 0) return { pushed: false };
  const stray = staged.filter((p) => !inNightlyPaths(p));
  if (stray.length > 0) throw new Error(`Fremde Pfade im Commit, nichts committet:\n  ${stray.join("\n  ")}`);
  git(["commit", "-q", "-m", o.message]);
  rebaseAndPush(git, o.validate);
  return { pushed: true };
}

/**
 * Gemeinsamer Schluss von Nachtlauf und Entdecken (E6, E7.9): fremde Commits per `pull --rebase` nachholen (Konflikt
 * → Rebase abbrechen, rot ohne Push), erneut prüfen (ein fremder Commit, etwa ein entfernter Anbieter, kann den Stand
 * ungültig machen), dann nach `main` pushen.
 */
export function rebaseAndPush(git: Git, validate: () => void): void {
  try {
    git(["pull", "-q", "--rebase", "origin", "main"]);
  } catch (e) {
    try {
      git(["rebase", "--abort"]);
    } catch {
      // kein Rebase im Gang (etwa Netzfehler beim Holen)
    }
    throw new Error(`Konflikt oder Fehler beim Nachholen von origin/main, nichts gepusht: ${(e as Error).message}`);
  }
  validate();
  git(["push", "-q", "origin", "HEAD:main"]);
}
