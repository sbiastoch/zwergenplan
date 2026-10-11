/**
 * Live-Stand gegen `main` für den Bericht (Plan 0032, E6/E10): `commit` aus `<SITE_URL>data/meta.json` gegen
 * `origin/main`. Commits nur mit Doku zählen nicht (Doku-Pfad ohne Deploy, ADR 0021, Teil B; Positivliste aus
 * `scripts/lib/change-class.ts`). Netz- oder git-Fehler ergeben „unbekannt“, nie einen Abbruch.
 */
import { SITE_URL } from "../../../site.config.ts";
import { isDocPath } from "../../lib/change-class.ts";
import { type LiveStatus, liveLag, parseCommitLog } from "../lib/report.ts";
import { git } from "./files.ts";

const MAIN = "origin/main";

async function liveCommit(): Promise<{ commit?: string; reason?: string }> {
  try {
    const res = await fetch(`${SITE_URL}data/meta.json`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { reason: `meta.json HTTP ${res.status}` };
    const meta: unknown = await res.json();
    const commit =
      typeof meta === "object" && meta !== null && "commit" in meta && typeof meta.commit === "string"
        ? meta.commit
        : undefined;
    return commit ? { commit } : { reason: "meta.json ohne commit" };
  } catch (e) {
    return { reason: `meta.json nicht abrufbar: ${(e as Error).message}` };
  }
}

export async function liveStatus(now: Date = new Date()): Promise<LiveStatus> {
  const live = await liveCommit();
  let head: string;
  try {
    head = git(["rev-parse", MAIN]);
  } catch {
    return { kind: "unbekannt", reason: `${MAIN} fehlt im Checkout` };
  }
  if (!live.commit) return liveLag({ liveCommit: undefined, head, missing: [], now, reason: live.reason ?? "" });
  let missing: Array<{ sha: string; at: string; docOnly: boolean }> | undefined;
  try {
    git(["merge-base", "--is-ancestor", live.commit, MAIN]);
    const log = git(["log", "--format=%x00%H%x09%cI", "--name-only", `${live.commit}..${MAIN}`]);
    missing = parseCommitLog(log).map((c) => ({ sha: c.sha, at: c.at, docOnly: c.files.every(isDocPath) }));
  } catch {
    missing = undefined; // Live-Commit nicht in main (oder flacher Checkout)
  }
  return liveLag({ liveCommit: live.commit, head, missing, now });
}
