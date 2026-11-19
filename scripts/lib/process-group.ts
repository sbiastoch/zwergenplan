/**
 * Prozessgruppen beenden (Plan 0027, E7), gemeinsam für scripts/heavy.ts und scripts/heavy-watchdog.ts.
 * Stufen: SIGINT (Playwright räumt seine Browser und den webServer ab, die in eigenen Gruppen laufen), dann SIGTERM
 * (Hintergrundprozesse einer nicht-interaktiven Shell ignorieren SIGINT), zuletzt SIGKILL. Nur Node-Builtins.
 */
import { readdirSync, readFileSync } from "node:fs";

/**
 * Zustand und Prozessgruppe aus `/proc/<pid>/stat`. Der Name (Feld 2) steht in Klammern und darf Leerzeichen und
 * Klammern enthalten, deshalb ab der letzten schließenden Klammer zählen.
 */
export function parseStat(text: string): { state: string; pgrp: number } | undefined {
  const rest = text.slice(text.lastIndexOf(")") + 2).split(" ");
  const [state, , pgrp] = rest;
  return state && pgrp ? { state, pgrp: Number(pgrp) } : undefined;
}

const stat = (pid: string) => {
  try {
    return parseStat(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return undefined;
  }
};

/**
 * Lebt noch ein Prozess (pid > 0) bzw. eine Gruppe (pid < 0)? Ein Zombie zählt nicht: In Containern, deren PID 1
 * verwaiste Prozesse nicht erntet, bliebe eine beendete Gruppe sonst für immer „lebendig“ (Stop-Gate 2026-11-19).
 * Unter Linux über `/proc`, sonst (oder ohne `/proc`) über das Signal 0.
 */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  let pids: string[];
  try {
    pids = pid > 0 ? [String(pid)] : readdirSync("/proc").filter((d) => /^\d+$/.test(d));
  } catch {
    return true;
  }
  return pids.some((p) => {
    const s = stat(p);
    return s !== undefined && s.state !== "Z" && (pid > 0 || s.pgrp === -pid);
  });
}

/** Fristen aus der Umgebung, bei fehlendem oder ungültigem Wert der Standard (Arch-Review e6, m7). */
export function graceMs(raw: string | undefined, fallback: number): number {
  const ms = Number(raw);
  return raw !== undefined && Number.isFinite(ms) && ms >= 0 ? ms : fallback;
}

async function signalAndWait(pgid: number, signal: NodeJS.Signals, ms: number): Promise<boolean> {
  try {
    process.kill(-pgid, signal);
  } catch {
    return true; // Gruppe schon leer
  }
  const end = Date.now() + ms;
  while (alive(-pgid) && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return !alive(-pgid);
}

/** Beendet die Gruppe in Stufen und kehrt erst zurück, wenn sie leer ist (oder SIGKILL geschickt wurde). */
export async function stopGroup(pgid: number, intMs: number, termMs: number): Promise<void> {
  if (await signalAndWait(pgid, "SIGINT", intMs)) return;
  if (await signalAndWait(pgid, "SIGTERM", termMs)) return;
  await signalAndWait(pgid, "SIGKILL", 0);
}
