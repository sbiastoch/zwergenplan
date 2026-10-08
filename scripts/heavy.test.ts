import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { alive as processAlive } from "./lib/process-group.ts";

/**
 * Maschinenweite Sperre für schwere Läufe (Plan 0027, E7, Review M1). Jeder Test nutzt einen eigenen Ordner für die
 * Sperre (ZP_LOCK_DIR) und fasst die echte Sperre in ~/.cache/zwergenplan nie an.
 */
const HEAVY = fileURLToPath(new URL("./heavy.ts", import.meta.url));
const dirs: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  const kill = (pgid: number) => {
    try {
      process.kill(-pgid, "SIGKILL");
    } catch {
      // schon beendet
    }
  };
  for (const c of children.splice(0)) if (c.pid) kill(c.pid);
  // auch die Gruppe des Laufs (flock), die heavy.holder nennt (Arch-Review e6, m7)
  for (const d of dirs.splice(0)) {
    if (existsSync(holderFile(d))) kill(pgidOf(d));
    // und übrig gebliebene Wächter (eigene Gruppe, PID in heavy.watchdog.<pgid>)
    for (const f of readdirSync(d).filter((n) => n.startsWith("heavy.watchdog."))) {
      try {
        process.kill(Number(readFileSync(join(d, f), "utf8")), "SIGKILL");
      } catch {
        // schon beendet
      }
    }
    rmSync(d, { recursive: true, force: true });
  }
});

function lockDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "zp-heavy-"));
  dirs.push(dir);
  return dir;
}

function env(dir: string, wait: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  // kurze Fristen, damit der Test schnell bleibt; die Stufen (SIGINT, SIGTERM, SIGKILL) bleiben dieselben.
  // ZP_HEAVY_LOCK leer: Der Test darf nicht als verschachtelter Aufruf laufen, auch wenn Vitest unter heavy.ts läuft.
  return {
    ...process.env,
    ZP_HEAVY_LOCK: "",
    ZP_LOCK_DIR: dir,
    ZP_LOCK_WAIT: wait,
    ZP_INT_GRACE_MS: "100",
    ZP_TERM_GRACE_MS: "100",
    ...extra,
  };
}

function holder(dir: string, script: string, extra: NodeJS.ProcessEnv = {}): ChildProcess {
  const c = spawn("node", [HEAVY, "sh", "-c", script], { env: env(dir, "0", extra), stdio: "ignore", detached: true });
  children.push(c);
  return c;
}

async function until(cond: () => boolean, ms = 5_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("Bedingung nicht erreicht");
    await new Promise((r) => setTimeout(r, 25));
  }
}

const holderFile = (dir: string) => join(dir, "heavy.holder");
const pgidOf = (dir: string) => Number(readFileSync(holderFile(dir), "utf8").split("\n")[3]);
/** Lebt die Gruppe noch? (process-group.ts: negative Zahl = Gruppe) */
const alive = (pgid: number) => processAlive(-pgid);
const watchdogFile = (dir: string, pgid: number) => join(dir, `heavy.watchdog.${pgid}`);
const watchdogPid = (dir: string, pgid: number) => Number(readFileSync(watchdogFile(dir, pgid), "utf8"));
const tryLock = (dir: string) =>
  spawnSync("node", [HEAVY, "sh", "-c", "exit 0"], { env: env(dir, "0"), encoding: "utf8" });

describe("heavy.ts", () => {
  it("führt das Kommando aus, reicht den Exit-Code durch und setzt ZP_HEAVY_LOCK=1", () => {
    const r = spawnSync("node", [HEAVY, "sh", "-c", 'test "$ZP_HEAVY_LOCK" = 1 && exit 7'], {
      env: env(lockDir(), "0"),
      encoding: "utf8",
    });
    expect(r.status).toBe(7);
  });

  it("ein zweiter Lauf endet bei belegter Sperre mit Exit 75 und nennt Halter und Kommando", async () => {
    const dir = lockDir();
    holder(dir, "sleep 3");
    await until(() => existsSync(holderFile(dir)));
    const r = tryLock(dir);
    expect(r.status).toBe(75);
    expect(r.stderr).toContain("E2E-Sperre belegt");
    expect(r.stderr).toContain("sleep 3");
    expect(r.stderr).toContain("ZP_LOCK_WAIT");
  });

  it("mit Wartezeit startet der zweite erst nach dem ersten", async () => {
    const dir = lockDir();
    const first = holder(dir, "sleep 0.2");
    await until(() => existsSync(holderFile(dir)));
    let firstEnded = 0;
    first.on("exit", () => {
      firstEnded = Date.now();
    });
    const r = await new Promise<{ code: number | null; at: number }>((resolve) => {
      const c = spawn("node", [HEAVY, "sh", "-c", "exit 0"], { env: env(dir, "10"), stdio: "ignore" });
      c.on("exit", (code) => resolve({ code, at: Date.now() }));
    });
    expect(r.code).toBe(0);
    expect(firstEnded).toBeGreaterThan(0);
    expect(r.at).toBeGreaterThanOrEqual(firstEnded);
  });

  it("SIGTERM an heavy.ts beendet die ganze Gruppe samt Enkel und gibt die Sperre frei", async () => {
    const dir = lockDir();
    const h = holder(dir, "sleep 30 & wait");
    await until(() => existsSync(holderFile(dir)));
    const pgid = pgidOf(dir);
    expect(alive(pgid)).toBe(true);
    h.kill("SIGTERM");
    // Der Hintergrund-sleep ignoriert SIGINT (nicht-interaktive Shell), also greift erst SIGTERM
    await until(() => !alive(pgid));
    expect(tryLock(dir).status).toBe(0);
  }, 15_000);

  it("SIGKILL an heavy.ts und flock gibt die Sperre frei, auch wenn der Enkel weiterläuft (flock -o)", async () => {
    const dir = lockDir();
    // ohne Wächter, damit nur flock -o die Sperre freigeben kann
    const h = holder(dir, "sleep 30 & wait", { ZP_NO_WATCHDOG: "1" });
    await until(() => existsSync(holderFile(dir)));
    const pgid = pgidOf(dir);
    h.kill("SIGKILL"); // heavy.ts kann nicht mehr aufräumen
    process.kill(pgid, "SIGKILL"); // der Gruppenleiter ist flock
    await until(() => tryLock(dir).status === 0);
    expect(alive(pgid)).toBe(true); // der Enkel lebt noch, hält die Sperre aber nicht
    process.kill(-pgid, "SIGKILL");
  });

  it("SIGKILL nur an heavy.ts (Bash-Tool bricht ab): der Wächter räumt die Gruppe ab, die Sperre wird frei (M2)", async () => {
    const dir = lockDir();
    const h = holder(dir, "sleep 30 & wait");
    await until(() => existsSync(holderFile(dir)));
    const pgid = pgidOf(dir);
    await until(() => existsSync(watchdogFile(dir, pgid)));
    const watchdog = watchdogPid(dir, pgid);
    h.kill("SIGKILL");
    await until(() => !alive(pgid));
    expect(tryLock(dir).status).toBe(0);
    // der Wächter beendet sich nach dem Aufräumen selbst
    await until(() => !processAlive(watchdog));
  }, 15_000);

  it("nach normalem Ende beendet sich der Wächter selbst (Review ef36c19, m4)", async () => {
    const dir = lockDir();
    const h = holder(dir, "sleep 0.2");
    await until(() => existsSync(holderFile(dir)));
    const pgid = pgidOf(dir);
    await until(() => existsSync(watchdogFile(dir, pgid)));
    const watchdog = watchdogPid(dir, pgid);
    await new Promise((r) => h.on("exit", r));
    await until(() => !processAlive(watchdog));
    expect(existsSync(watchdogFile(dir, pgid))).toBe(false);
  });

  it("reicht Argumente an `sh -c` unverändert durch (Arch-Review Etappe 4, M1)", () => {
    const r = spawnSync("node", [HEAVY, "sh", "-c", 'printf "%s|" "$@"', "e2e", "--project=pixel-7", "a b"], {
      env: env(lockDir(), "0"),
      encoding: "utf8",
    });
    expect(r.stdout).toBe("--project=pixel-7|a b|");
  });

  it("ignoriert die Gruppe SIGINT und SIGTERM: nach der Frist SIGKILL, danach ist die Gruppe leer (M2)", async () => {
    const dir = lockDir();
    const h = holder(dir, 'trap "" INT TERM; sleep 30');
    await until(() => existsSync(holderFile(dir)));
    const pgid = pgidOf(dir);
    const exited = new Promise<number>((resolve) => h.on("exit", () => resolve(Date.now())));
    h.kill("SIGTERM");
    await exited;
    // heavy.ts endet erst, wenn die Gruppe leer ist
    expect(alive(pgid)).toBe(false);
  }, 15_000);

  it("ein verschachtelter Aufruf unter der Sperre läuft direkt, ohne sich auszusperren (M3)", () => {
    const r = spawnSync("node", [HEAVY, "node", HEAVY, "sh", "-c", "exit 0"], {
      env: env(lockDir(), "0"),
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
  });

  it("Exit 75 des Kommandos selbst meldet keine belegte Sperre (m1)", () => {
    const r = spawnSync("node", [HEAVY, "sh", "-c", "exit 75"], { env: env(lockDir(), "0"), encoding: "utf8" });
    expect(r.status).toBe(75);
    expect(r.stderr).not.toContain("E2E-Sperre belegt");
  });

  it("die Meldung bei belegter Sperre nennt, wie man einen hängenden Halter beendet (m1)", async () => {
    const dir = lockDir();
    holder(dir, "sleep 3");
    await until(() => existsSync(holderFile(dir)));
    expect(tryLock(dir).stderr).toContain(`kill -- -${pgidOf(dir)}`);
  });
});
