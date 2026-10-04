/**
 * PostToolBatch: nach einem Stapel paralleler Edits einmal den Typecheck über das ganze Projekt
 * (TS 7, < 1 s). Nicht pro Edit – Zwischenstände bei Mehrdatei-Refactorings wären nur Rauschen.
 */
import { addContext, readInput, run, tail } from "./lib.ts";

interface Call {
  tool_name: string;
  tool_input?: { file_path?: string };
}
const input = await readInput<{ tool_calls?: Call[] }>();
const touchedTs = (input.tool_calls ?? []).some(
  (c) => (c.tool_name === "Edit" || c.tool_name === "Write") && /\.(ts|tsx)$/.test(c.tool_input?.file_path ?? ""),
);
if (!touchedTs) process.exit(0);

const tsc = run("pnpm", ["exec", "tsc", "--noEmit", "-p", "."]);
if (!tsc.ok) addContext("PostToolBatch", `Typecheck rot (tsc):\n${tail(tsc.output, 30)}`);
