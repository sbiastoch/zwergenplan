/**
 * git des Entdeckens (Plan 0032, E7.8–E7.9): ein Commit je neuem Anbieter (G4) nach G2 (nur neue Katalogeinträge)
 * und G1 (`data:validate`, `check:fast`, als `gate` übergeben), ein Commit für Zustand und Kosten am Ende, Push nach
 * `main` im Job mit Schreibrecht. Getestet nur mit `tempRepo()` (CLAUDE.md, git in Tests).
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { catalogDiff } from "../lib/catalog-diff.ts";
import { changedPaths, type Git, rebaseAndPush } from "./publish.ts";

const CATALOG_PATH = "data/providers.yaml";
const STATE_PATHS = ["data/discover", "data/kosten.csv"] as const;

/** G1 rot: der Anbieter wird nicht aufgenommen, der Lauf geht weiter. Jeder andere Fehler bricht den Lauf ab. */
export class GateError extends Error {}

const within = (path: string, roots: readonly string[]) => roots.some((r) => path === r || path.startsWith(`${r}/`));

function onlyPaths(git: Git, allowed: readonly string[]): void {
  const foreign = changedPaths(git).filter((p) => !within(p, allowed));
  if (foreign.length > 0)
    throw new Error(`Änderungen außerhalb der Daten des Entdeckens, nichts committet:\n  ${foreign.join("\n  ")}`);
}

/** G2: Der Katalog im Arbeitsbaum hat gegenüber HEAD genau die erwarteten neuen Einträge und sonst keine Änderung. */
function checkCatalog(git: Git, root: string, expected: readonly string[]): void {
  const d = catalogDiff(
    parse(git(["show", `HEAD:${CATALOG_PATH}`])),
    parse(readFileSync(join(root, CATALOG_PATH), "utf8")),
  );
  if (!d.ok)
    throw new Error(`G2: Änderung an bestehenden Katalogeinträgen, Lauf abgebrochen:\n  ${d.errors.join("\n  ")}`);
  if (d.added.join(",") !== expected.join(","))
    throw new Error(
      `G2: neue Katalogeinträge ${d.added.join(", ") || "keine"}, erwartet ${expected.join(", ") || "keine"}`,
    );
}

/**
 * G4: Commit eines neuen Anbieters (Katalog und `data/raw/<id>.json`). Scheitert G1, werden beide Änderungen
 * zurückgenommen und `GateError` geworfen; G2 und fremde Änderungen werfen einen gewöhnlichen Fehler (Abbruch).
 */
export function commitNewProvider(o: { git: Git; root: string; id: string; message: string; gate: () => void }): void {
  const raw = `data/raw/${o.id}.json`;
  // ein neuer Anbieter kommt immer mit dem Zustand seines Ertragsbeweises (E1: ein Extraktionsweg)
  if (!existsSync(join(o.root, raw))) throw new Error(`${raw} fehlt`);
  onlyPaths(o.git, [CATALOG_PATH, raw]);
  checkCatalog(o.git, o.root, [o.id]);
  try {
    o.gate();
  } catch (e) {
    o.git(["checkout", "-q", "HEAD", "--", CATALOG_PATH]);
    rmSync(join(o.root, raw), { force: true });
    throw new GateError(`G1 rot: ${(e as Error).message.split("\n")[0]}`);
  }
  o.git(["add", "--", CATALOG_PATH, raw]);
  o.git(["commit", "-q", "-m", o.message]);
}

/** Zustand `data/discover/` und `data/kosten.csv` am Ende des Laufs; `false`, wenn sich nichts geändert hat. */
export function commitRunState(o: { git: Git; root: string; message: string; gate: () => void }): boolean {
  onlyPaths(o.git, STATE_PATHS);
  checkCatalog(o.git, o.root, []);
  if (changedPaths(o.git).length === 0) return false;
  try {
    o.gate();
  } catch (e) {
    throw new GateError(`G1 rot: ${(e as Error).message.split("\n")[0]}`);
  }
  o.git(["add", "-A", "--", ...STATE_PATHS]);
  o.git(["commit", "-q", "-m", o.message]);
  return true;
}

export interface PushedCommit {
  sha: string;
  message: string;
}

/**
 * Push der Commits des Laufs nach `main` (E7.9) wie der Nachtlauf (`rebaseAndPush`). Liefert die Commits nach dem
 * Rebase (für das Issue mit Commit-Links, E7.10); ohne eigene Commits kein Push.
 */
export function publishDiscover(o: { git: Git; validate: () => void }): { pushed: boolean; commits: PushedCommit[] } {
  const { git } = o;
  if (git(["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") throw new Error("publish nur auf main (ADR 0002)");
  onlyPaths(git, []);
  if (Number(git(["rev-list", "--count", "origin/main..HEAD"])) === 0) return { pushed: false, commits: [] };
  let commits: PushedCommit[] = [];
  rebaseAndPush(git, () => {
    // nach dem Rebase (FETCH_HEAD = origin/main) und vor dem Push: so tragen die Links die SHAs auf main
    commits = git(["log", "--reverse", "--format=%H%x1f%B%x1e", "FETCH_HEAD..HEAD"])
      .split("\x1e")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const [sha = "", message = ""] = c.split("\x1f");
        return { sha, message: message.trim() };
      });
    o.validate();
  });
  return { pushed: true, commits };
}
