/**
 * Maschinenweite Sperre für schwere Läufe, vor allem E2E (Plan 0027, E7, Review M1). Ein Platz: Über alle Worktrees
 * und Sessions läuft höchstens ein solcher Lauf gleichzeitig.
 *
 *   node scripts/heavy.ts <kommando …>
 *
 * - `flock -o`: Die Sperre hält nur der flock-Prozess, Kinder erben den Deskriptor nicht. Endet flock, auch per
 *   SIGKILL, gibt der Kernel die Sperre frei.
 * - flock läuft in einer eigenen Prozessgruppe. Bei SIGINT/SIGTERM/SIGHUP und nach dem Ende beendet heavy.ts die ganze
 *   Gruppe. So bleiben keine Browser oder `vite preview` übrig.
 * - Wartezeit `ZP_LOCK_WAIT` Sekunden (Standard 30), danach Exit 75 mit Hinweis auf den Halter. Das Bash-Tool der
 *   Agents bricht nach 10 Minuten ab. Wer länger warten will, startet mit ZP_LOCK_WAIT=1800 im Hintergrund.
 * - Das Kommando bekommt ZP_HEAVY_LOCK=1. Daran erkennt e2e/global-setup.ts, dass die Sperre gehalten wird.
 * - Ohne flock (macOS) läuft das Kommando mit Warnung ohne Sperre.
 * - Bekannte Grenze: Wird heavy.ts selbst per SIGKILL beendet, laufen flock und das Kommando weiter, bis sie enden.
 * Nur Node-Builtins.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const EXIT_BUSY = 75;
const KILL_GRACE_MS = 5_000;

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error("Aufruf: node scripts/heavy.ts <kommando …>");
  process.exit(2);
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

const hasFlock = spawnSync("flock", ["--version"], { stdio: "ignore" }).status === 0;
const env = { ...process.env, ZP_HEAVY_LOCK: "1", ZP_HOLDER_FILE: holderFile, ZP_HOLDER_CMD: command.join(" ") };
// Nach dem Erwerb schreibt der Halter, wer er ist: Worktree, Kommando, Zeit, Prozessgruppe.
const announce =
  'printf "%s\\n%s\\n%s\\n%s\\n" "$PWD" "$ZP_HOLDER_CMD" "$(date -Iseconds)" "$(ps -o pgid= -p $$ | tr -d " ")" > "$ZP_HOLDER_FILE"; exec "$@"';
const [cmd, ...args] = hasFlock
  ? ["flock", "-o", "-E", String(EXIT_BUSY), "-w", String(wait), lockFile, "sh", "-c", announce, "heavy", ...command]
  : ["sh", "-c", announce, "heavy", ...command];
if (!hasFlock) console.error("⚠ flock fehlt: schwerer Lauf ohne maschinenweite Sperre (Plan 0027, E7)");

const child = spawn(cmd ?? "sh", args, { detached: true, stdio: "inherit", env });
const pgid = child.pid ?? 0;

function killGroup(signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch {
    // Gruppe schon leer
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    killGroup("SIGTERM");
    setTimeout(() => killGroup("SIGKILL"), KILL_GRACE_MS).unref();
  });
}

child.on("exit", (code, signal) => {
  // Reste der Gruppe (Hintergrundprozesse, Server) mitnehmen
  killGroup("SIGTERM");
  if (code === EXIT_BUSY && hasFlock) {
    let holder = ["?", "?", "?"];
    try {
      holder = readFileSync(holderFile, "utf8").split("\n");
    } catch {
      // Halter hat noch nichts geschrieben
    }
    console.error(
      `E2E-Sperre belegt von ${holder[0]}, Kommando „${holder[1]}“, seit ${holder[2]}. ` +
        `Später erneut, oder warten mit ZP_LOCK_WAIT=1800 und run_in_background (Plan 0027, E7).`,
    );
  }
  process.exit(code ?? (signal === "SIGINT" ? 130 : 143));
});
