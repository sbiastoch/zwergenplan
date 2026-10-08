/**
 * Prozessgruppen beenden (Plan 0027, E7), gemeinsam für scripts/heavy.ts und scripts/heavy-watchdog.ts.
 * Stufen: SIGINT (Playwright räumt seine Browser und den webServer ab, die in eigenen Gruppen laufen), dann SIGTERM
 * (Hintergrundprozesse einer nicht-interaktiven Shell ignorieren SIGINT), zuletzt SIGKILL. Nur Node-Builtins.
 */

/** Lebt noch ein Prozess (pid > 0) bzw. eine Gruppe (pid < 0)? */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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
