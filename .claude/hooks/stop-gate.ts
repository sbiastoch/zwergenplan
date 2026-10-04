/**
 * Stop-Gate: Claude darf nicht „fertig“ melden, solange check:fast rot ist.
 * - Unveränderter Arbeitsstand seit dem letzten grünen Lauf → sofort durchlassen (billig bei reinen Fragen).
 * - Rot → blockieren (Exit 2), höchstens MAX_BLOCKS-mal pro Arbeitsstand, danach mit Warnung durchlassen.
 * - Große Änderung ohne /arch-review → einmaliger Hinweis.
 */
import { PROJECT_DIR, readInput, readState, run, tail, treeHash, writeState } from "./lib.ts";

const MAX_BLOCKS = 3;
const REVIEW_THRESHOLD_LINES = 200;

const input = await readInput<{ session_id?: string }>();
const hash = treeHash();
const green = readState<{ hash?: string }>("last-green.json", {});

if (green.hash !== hash) {
  const check = run("node", ["scripts/check-fast.ts"]);
  if (check.ok) {
    writeState("last-green.json", { hash });
  } else {
    const key = `stop-blocks-${input.session_id ?? "x"}.json`;
    const blocks = readState<{ hash?: string; count: number }>(key, { count: 0 });
    const count = blocks.hash === hash ? blocks.count + 1 : 1;
    writeState(key, { hash, count });
    if (count <= MAX_BLOCKS) {
      process.stderr.write(
        `check:fast ist ROT – bitte beheben, bevor du fertig meldest (Versuch ${count}/${MAX_BLOCKS}).\n${tail(check.output, 40)}\n`,
      );
      process.exit(2);
    }
    process.stdout.write(
      JSON.stringify({
        systemMessage: `⚠ Stop-Gate nach ${MAX_BLOCKS} Versuchen freigegeben – check:fast ist weiterhin ROT.`,
      }),
    );
    process.exit(0);
  }
}

// Review-Erinnerung: große Änderung gegenüber main ohne passenden Review-Marker.
const base = run("git", ["merge-base", "HEAD", "origin/main"]);
const ref = base.ok ? base.output : "main";
const stat = run("git", ["diff", "--shortstat", ref]).output;
const changed = [...stat.matchAll(/(\d+) (?:insertion|deletion)/g)].reduce((n, m) => n + Number(m[1]), 0);
const review = readState<{ hash?: string }>("arch-review.json", {});
const reminded = readState<{ hash?: string }>("review-reminded.json", {});
if (changed > REVIEW_THRESHOLD_LINES && review.hash !== hash && reminded.hash !== hash) {
  writeState("review-reminded.json", { hash });
  process.stderr.write(
    `Große Änderung (${changed} Zeilen ggü. ${ref.slice(0, 8)}) ohne aktuelles /arch-review. ` +
      `Laut CLAUDE.md vor „fertig“: /arch-review ausführen (bei UI-Änderungen zusätzlich /browser-review). Projekt: ${PROJECT_DIR}\n`,
  );
  process.exit(2);
}
