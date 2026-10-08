/**
 * Maschinenweite Sperre für schwere Läufe, vor allem E2E (Plan 0027, E7, Review M1). Ein Platz: Über alle Worktrees
 * und Sessions läuft höchstens ein solcher Lauf gleichzeitig.
 *
 *   node scripts/heavy.ts <kommando …>
 *
 * - `flock -o`: Die Sperre hält nur der flock-Prozess, Kinder erben den Deskriptor nicht. Endet flock, auch per
 *   SIGKILL, gibt der Kernel die Sperre frei.
 * - flock läuft in einer eigenen Prozessgruppe. Bei SIGINT/SIGTERM/SIGHUP und nach dem Ende schickt heavy.ts der
 *   ganzen Gruppe SIGINT, nach 7 s SIGTERM und nach 10 s SIGKILL, bis sie leer ist (Arch-Review Etappe 4, M2).
 * - Warum SIGINT: Playwright startet Browser und webServer (`vite preview`) in eigenen Prozessgruppen, die ein
 *   Gruppensignal nicht erreicht. Nur auf SIGINT räumt Playwright sie selbst ab (wie bei Ctrl+C). Bei SIGTERM blieb
 *   im Versuch der Preview-Server übrig (Abnahme m4, Plan 0027, Ergebnis Etappe 4).
 * - Grenze: SIGINT beendet auch flock. Die Sperre ist dann frei, während die Kinder noch abbauen (höchstens 10 s).
 * - Wartezeit `ZP_LOCK_WAIT` Sekunden (Standard 30), danach Exit 75 mit Hinweis auf den Halter. Das Bash-Tool der
 *   Agents bricht nach 10 Minuten ab. Wer länger warten will, startet mit ZP_LOCK_WAIT=1800 im Hintergrund.
 * - Das Kommando bekommt ZP_HEAVY_LOCK=1. Daran erkennt e2e/global-setup.ts die Sperre. Ein verschachtelter Aufruf
 *   mit ZP_HEAVY_LOCK=1 führt das Kommando direkt aus, sonst sperrte er sich selbst aus (M3).
 * - Ohne nutzbares flock (fehlt oder kann -o/-E/-w nicht, etwa auf macOS) läuft das Kommando mit Warnung ohne Sperre.
 * - Wird heavy.ts selbst per SIGKILL beendet (etwa wenn das Bash-Tool einen Hintergrundlauf abbricht), räumt der
 *   Wächter scripts/heavy-watchdog.ts in eigener Prozessgruppe die Gruppe des Laufs ab, und die Sperre wird frei.
 * Nur Node-Builtins.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { graceMs, stopGroup } from "./lib/process-group.ts";

const EXIT_BUSY = 75;
// Fristen nur für Tests überschreibbar, damit check:fast schnell bleibt; ungültig → Standard
const INT_GRACE_MS = graceMs(process.env["ZP_INT_GRACE_MS"], 7_000);
const TERM_GRACE_MS = graceMs(process.env["ZP_TERM_GRACE_MS"], 3_000);

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error("Aufruf: node scripts/heavy.ts <kommando …>");
  process.exit(2);
}

// Schon unter der Sperre (verschachtelt): direkt ausführen
if (process.env["ZP_HEAVY_LOCK"] === "1") {
  const [cmd = "", ...args] = command;
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

const dir = process.env["ZP_LOCK_DIR"] ?? join(homedir(), ".cache", "zwergenplan");
mkdirSync(dir, { recursive: true });
const lockFile = join(dir, "heavy.lock");
const holderFile = join(dir, "heavy.holder");
const waitRaw = process.env["ZP_LOCK_WAIT"] ?? "30";
const wait = Number(waitRaw);
if (!Number.isFinite(wait) || wait < 0) {
  console.error(`ZP_LOCK_WAIT=${waitRaw} ist keine Sekundenzahl`);
  process.exit(2);
}

// Kann flock genau das, was wir brauchen? (Arch-Review m7)
const probe = join(dir, `heavy.probe.${process.pid}`);
const hasFlock =
  spawnSync("flock", ["-o", "-E", String(EXIT_BUSY), "-w", "0", probe, "true"], { stdio: "ignore" }).status === 0;
rmSync(probe, { force: true });
const env = { ...process.env, ZP_HEAVY_LOCK: "1", ZP_HOLDER_FILE: holderFile, ZP_HOLDER_CMD: command.join(" ") };
// Nach dem Erwerb schreibt der Halter, wer er ist: Worktree, Kommando, Zeit, Prozessgruppe.
const announce =
  'printf "%s\\n%s\\n%s\\n%s\\n" "$PWD" "$ZP_HOLDER_CMD" "$(date -Iseconds)" "$(ps -o pgid= -p $$ | tr -d " ")" > "$ZP_HOLDER_FILE"; exec "$@"';
const [cmd, ...args] = hasFlock
  ? ["flock", "-o", "-E", String(EXIT_BUSY), "-w", String(wait), lockFile, "sh", "-c", announce, "heavy", ...command]
  : ["sh", "-c", announce, "heavy", ...command];
if (!hasFlock) console.error("⚠ flock fehlt oder ist zu alt: schwerer Lauf ohne maschinenweite Sperre (Plan 0027, E7)");

const child = spawn(cmd ?? "sh", args, { detached: true, stdio: "inherit", env });
const pgid = child.pid ?? 0;

// Wächter in eigener Gruppe: räumt ab, falls heavy.ts selbst per SIGKILL endet (Arch-Review e6, M2).
// ZP_NO_WATCHDOG=1 nur für den Test, der zeigt, dass flock -o die Sperre auch ohne Aufräumen freigibt.
if (pgid > 0 && process.env["ZP_NO_WATCHDOG"] !== "1") {
  const watchdog = fileURLToPath(new URL("./heavy-watchdog.ts", import.meta.url));
  spawn("node", [watchdog, String(process.pid), String(pgid)], { detached: true, stdio: "ignore" }).unref();
}

let exitCode: number | undefined;
let stopping: Promise<void> | undefined;
async function finish(code: number): Promise<void> {
  exitCode ??= code;
  stopping ??= stopGroup(pgid, INT_GRACE_MS, TERM_GRACE_MS);
  await stopping;
  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => void finish(signal === "SIGINT" ? 130 : 143));
}

child.on("exit", (code, signal) => {
  if (code === EXIT_BUSY && hasFlock) {
    // 75 kann auch das Kommando selbst liefern; „belegt“ ist es nur, wenn ein anderer Halter eingetragen ist (m1).
    let holder = ["?", "?", "?", "?"];
    try {
      holder = readFileSync(holderFile, "utf8").split("\n");
    } catch {
      // Halter hat noch nichts geschrieben
    }
    if (holder[3] !== String(pgid)) {
      console.error(
        `E2E-Sperre belegt von ${holder[0]}, Kommando „${holder[1]}“, seit ${holder[2]}. ` +
          `Später erneut, oder warten mit ZP_LOCK_WAIT=1800 und run_in_background. ` +
          `Hängt der Halter: kill -- -${holder[3]} (Plan 0027, E7).`,
      );
    }
  }
  void finish(code ?? (signal === "SIGINT" ? 130 : 143));
});
