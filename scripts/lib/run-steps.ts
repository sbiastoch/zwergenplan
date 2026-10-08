/**
 * Prüfschritte parallel ausführen, jeden in einer eigenen Prozessgruppe (Plan 0027, E5.4).
 * Läuft das Zeitlimit ab oder kommt SIGINT/SIGTERM, wird die ganze Gruppe beendet, auch Enkel wie
 * Vitest-Worker; sonst liefen sie weiter, und das Hook-Timeout griffe doch. Nur Node-Builtins.
 */
import { spawn } from "node:child_process";

export interface Step {
  name: string;
  cmd: readonly string[];
}

export interface StepResult {
  name: string;
  ok: boolean;
  timedOut: boolean;
  output: string;
  pid: number;
  /** Exit-Code des Schritts; `null` bei Signal oder Startfehler */
  code: number | null;
}

const KILL_GRACE_MS = 2_000;
const running = new Set<number>();

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // Gruppe schon beendet
  }
}

function onSignal(signal: NodeJS.Signals): void {
  for (const pid of running) killGroup(pid, "SIGKILL");
  process.exit(signal === "SIGINT" ? 130 : 143);
}

export function runSteps(steps: readonly Step[], { timeoutMs }: { timeoutMs: number }): Promise<StepResult[]> {
  if (process.listenerCount("SIGINT") === 0) process.once("SIGINT", onSignal);
  if (process.listenerCount("SIGTERM") === 0) process.once("SIGTERM", onSignal);
  return Promise.all(steps.map((step) => runStep(step, timeoutMs)));
}

function runStep({ name, cmd: [cmd = "", ...args] }: Step, timeoutMs: number): Promise<StepResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { detached: true, env: { ...process.env, FORCE_COLOR: "0" } });
    const pid = child.pid ?? 0;
    if (pid > 0) running.add(pid);
    let output = "";
    let timedOut = false;
    child.stdout.on("data", (d) => {
      output += d;
    });
    child.stderr.on("data", (d) => {
      output += d;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      output += `\nZeitlimit (${Math.round(timeoutMs / 1000)} s) überschritten – Last zu hoch?`;
      killGroup(pid, "SIGTERM");
      setTimeout(() => killGroup(pid, "SIGKILL"), KILL_GRACE_MS).unref();
    }, timeoutMs);
    const finish = (code: number | null) => {
      clearTimeout(timer);
      running.delete(pid);
      resolve({ name, ok: code === 0 && !timedOut, timedOut, output, pid, code });
    };
    child.on("error", (e) => {
      output += String(e);
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}
