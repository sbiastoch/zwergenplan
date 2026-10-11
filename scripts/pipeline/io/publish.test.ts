import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type TempRepo, tempRepo } from "../../lib/temp-repo.ts";
import { publishNightly } from "./publish.ts";

const repos: TempRepo[] = [];
afterEach(() => {
  for (const r of repos.splice(0)) r.remove();
});

const write = (dir: string, path: string, text: string) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};

/**
 * Entfernte Seite („origin“, steht auf einem Parkzweig, damit Pushes nach main gehen) und Arbeitskopie auf main.
 * Alles über `tempRepo()` (CLAUDE.md, git in Tests).
 */
function setup() {
  const origin = tempRepo("zp-publish-origin-");
  const work = tempRepo("zp-publish-work-");
  repos.push(origin, work);
  write(origin.dir, "data/offers.json", "alt\n");
  write(origin.dir, "data/providers.yaml", "katalog\n");
  origin.git("add", "-A");
  origin.git("commit", "-qm", "start");
  origin.git("branch", "-M", "main");
  origin.git("checkout", "-q", "-b", "parken");
  work.git("remote", "add", "origin", origin.dir);
  work.git("fetch", "-q", "origin");
  work.git("checkout", "-q", "-B", "main", "origin/main");
  const run = (args: string[]) => work.git(...args).trim();
  return { origin, work, run };
}

describe("publishNightly (Plan 0032, E6)", () => {
  it("committet data/raw, offers.json und kosten.csv mit dem Text und pusht nach main", () => {
    const { origin, work, run } = setup();
    write(work.dir, "data/offers.json", "neu\n");
    write(work.dir, "data/raw/a.json", "{}\n");
    write(work.dir, "data/kosten.csv", "kopf\nzeile\n");
    let validated = 0;
    const r = publishNightly({ git: run, message: "data: Nachtlauf\n\nText", validate: () => validated++ });
    expect(r).toEqual({ pushed: true });
    expect(validated).toBe(1);
    expect(origin.git("log", "-1", "--format=%B", "main").trim()).toBe("data: Nachtlauf\n\nText");
    expect(origin.git("show", "--name-only", "--format=", "main").trim().split("\n").sort()).toEqual([
      "data/kosten.csv",
      "data/offers.json",
      "data/raw/a.json",
    ]);
  });

  it("holt fremde Commits per rebase nach und pusht danach", () => {
    const { origin, work, run } = setup();
    origin.git("checkout", "-q", "main");
    write(origin.dir, "data/providers.yaml", "katalog neu\n");
    origin.git("commit", "-qam", "Katalog");
    origin.git("checkout", "-q", "parken");
    write(work.dir, "data/kosten.csv", "kopf\n");
    expect(publishNightly({ git: run, message: "data: Nachtlauf", validate: () => {} })).toEqual({ pushed: true });
    expect(origin.git("log", "--format=%s", "main").trim().split("\n")).toEqual([
      "data: Nachtlauf",
      "Katalog",
      "start",
    ]);
  });

  it("Konflikt beim Rebase: rot ohne Push, Rebase abgebrochen", () => {
    const { origin, work, run } = setup();
    origin.git("checkout", "-q", "main");
    write(origin.dir, "data/offers.json", "von Hand\n");
    origin.git("commit", "-qam", "fremd");
    origin.git("checkout", "-q", "parken");
    const before = origin.git("rev-parse", "main").trim();
    write(work.dir, "data/offers.json", "Nachtlauf\n");
    expect(() => publishNightly({ git: run, message: "data: Nachtlauf", validate: () => {} })).toThrow(/Konflikt/);
    expect(origin.git("rev-parse", "main").trim()).toBe(before);
    expect(work.git("status", "--porcelain").includes("UU")).toBe(false);
  });

  it("Änderungen außerhalb der Daten des Nachtlaufs: kein Commit", () => {
    const { work, run } = setup();
    write(work.dir, "data/providers.yaml", "von Hand\n");
    write(work.dir, "data/kosten.csv", "kopf\n");
    expect(() => publishNightly({ git: run, message: "x", validate: () => {} })).toThrow(/data\/providers\.yaml/);
    expect(work.git("log", "--format=%s").trim()).toBe("start");
  });

  it("nur auf main", () => {
    const { work, run } = setup();
    work.git("checkout", "-q", "-b", "anders");
    expect(() => publishNightly({ git: run, message: "x", validate: () => {} })).toThrow(/main/);
  });

  it("scheitert die Prüfung, wird nichts committet", () => {
    const { work, run } = setup();
    write(work.dir, "data/kosten.csv", "kopf\n");
    const validate = () => {
      throw new Error("Plausibilität");
    };
    expect(() => publishNightly({ git: run, message: "x", validate })).toThrow(/Plausibilität/);
    expect(work.git("log", "--format=%s").trim()).toBe("start");
  });

  it("ohne Änderung kein Commit und kein Push", () => {
    const { run } = setup();
    expect(publishNightly({ git: run, message: "x", validate: () => {} })).toEqual({ pushed: false });
  });
});
