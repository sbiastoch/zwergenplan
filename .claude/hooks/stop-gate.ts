/**
 * Stop-Gate: Claude darf nicht „fertig“ melden, solange die Prüfung rot ist.
 * - `scripts/verify.ts --stop` entscheidet und prüft (Plan 0027, E5): Ist der Inhalt (Tree-ID) in den letzten 12 h
 *   grün gestempelt, läuft nichts, auch nicht nach einem Commit oder in einem anderen Worktree. Sonst prüft es nur
 *   die Stufe der Änderung seit dem letzten grünen Stand: Doku → check-docs, alles andere → check:fast.
 * - Rot oder Zeitlimit → blockieren (Exit 2), höchstens MAX_BLOCKS-mal pro Arbeitsstand, danach mit Warnung
 *   durchlassen. Ein Zeitlimit lässt nie still durch (Review 2, M-A).
 * - Große Änderung ohne /arch-review → einmaliger Hinweis.
 */
import {
  changedLines,
  exitIfNotInstalled,
  PROJECT_DIR,
  readInput,
  readState,
  run,
  tail,
  treeHash,
  writeState,
} from "./lib.ts";

exitIfNotInstalled();

const MAX_BLOCKS = 3;
const REVIEW_THRESHOLD_LINES = 200;
// Unter dem Hook-Timeout von 180 s (.claude/settings.json); verify beendet seine Prozessgruppen schon nach 150 s.
// Nur für Kanarienvögel überschreibbar (Plan 0027, K7).
const GATE_TIMEOUT_MS = Number(process.env["ZP_GATE_TIMEOUT_MS"] ?? 165_000);
const VERIFY_TIMEOUT = 3;

const input = await readInput<{ session_id?: string }>();
const check = run("node", ["scripts/verify.ts", "--stop"], { timeoutMs: GATE_TIMEOUT_MS });
const hash = treeHash();

if (!check.ok) {
  const timedOut = check.timedOut || check.status === VERIFY_TIMEOUT;
  const what = timedOut ? "Zeitlimit, nicht geprüft" : "ROT";
  const key = `stop-blocks-${input.session_id ?? "x"}.json`;
  const blocks = readState<{ hash?: string; count: number }>(key, { count: 0 });
  const count = blocks.hash === hash ? blocks.count + 1 : 1;
  writeState(key, { hash, count });
  if (count <= MAX_BLOCKS) {
    process.stderr.write(
      `Prüfung ${what} – bitte beheben, bevor du fertig meldest (Versuch ${count}/${MAX_BLOCKS}).\n${tail(check.output, 40)}\n`,
    );
    process.exit(2);
  }
  process.stdout.write(
    JSON.stringify({
      systemMessage: `⚠ Stop-Gate nach ${MAX_BLOCKS} Versuchen freigegeben – Prüfung weiterhin: ${what}.`,
    }),
  );
  process.exit(0);
}

// Review-Erinnerung: mehr als REVIEW_THRESHOLD_LINES geänderte Zeilen SEIT dem letzten /arch-review.
const { ref, lines } = changedLines();
const review = readState<{ hash?: string; ref?: string; lines?: number }>("arch-review.json", {});
const sinceReview = review.ref === ref ? lines - (review.lines ?? 0) : lines;
const reminded = readState<{ hash?: string }>("review-reminded.json", {});
if (sinceReview > REVIEW_THRESHOLD_LINES && review.hash !== hash && reminded.hash !== hash) {
  writeState("review-reminded.json", { hash });
  process.stderr.write(
    `Große Änderung (${sinceReview} Zeilen seit dem letzten Review, Basis ${ref.slice(0, 8)}) ohne /arch-review. ` +
      `Laut CLAUDE.md vor „fertig“: /arch-review ausführen (bei UI-Änderungen zusätzlich /browser-review). Projekt: ${PROJECT_DIR}\n`,
  );
  process.exit(2);
}
