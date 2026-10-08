import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Maschinenweite Sperre für schwere Läufe (Plan 0027, E7, Review M1). Jeder Test nutzt einen eigenen Ordner für die
 * Sperre (ZP_LOCK_DIR) und fasst die echte Sperre in ~/.cache/zwergenplan nie an.
 */
const HEAVY = fileURLToPath(new URL("./heavy.ts", import.meta.url));
const dirs: string[] = [];
const children: ChildProcess[] = [];
afterEach(() => {
  for (const c of children.splice(0)) {
    try {
      if (c.pid) process.kill(-c.pid, "SIGKILL");
    } catch {
      // schon beendet
    }
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function lockDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "zp-heavy-"));
  dirs.push(dir);
  return dir;
}

function env(dir: string, wait: string): NodeJS.ProcessEnv {
  // kurze Fristen, damit der Test schnell bleibt; die Stufen (SIGINT, SIGTERM, SIGKILL) bleiben dieselben
  return { ...process.env, ZP_LOCK_DIR: dir, ZP_LOCK_WAIT: wait, ZP_INT_GRACE_MS: "300", ZP_TERM_GRACE_MS: "300" };
}

function holder(dir: string, script: string): ChildProcess {
  const c = spawn("node", [HEAVY, "sh", "-c", script], { env: env(dir, "0"), stdio: "ignore", detached: true });
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
function alive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}
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
    const first = holder(dir, "sleep 1");
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
    const h = holder(dir, "sleep 30 & wait");
    await until(() => existsSync(holderFile(dir)));
    const pgid = pgidOf(dir);
    h.kill("SIGKILL"); // heavy.ts kann nicht mehr aufräumen (bekannte Grenze, E7)
    process.kill(pgid, "SIGKILL"); // der Gruppenleiter ist flock
    await until(() => tryLock(dir).status === 0);
    expect(alive(pgid)).toBe(true); // der Enkel lebt noch, hält die Sperre aber nicht
    process.kill(-pgid, "SIGKILL");
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
