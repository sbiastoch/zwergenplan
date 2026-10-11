import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type TempRepo, tempRepo } from "../../lib/temp-repo.ts";
import { commitNewProvider, commitRunState, GateError, publishDiscover } from "./discover-git.ts";

const repos: TempRepo[] = [];
afterEach(() => {
  for (const r of repos.splice(0)) r.remove();
});

const write = (dir: string, path: string, text: string) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};

const CATALOG = "- id: alt\n  name: Alt\n  notes:\n    - erste\n";
const WITH_NEW = `${CATALOG}- id: neu\n  name: Neu\n`;

/** Entfernte Seite auf einem Parkzweig (Pushes nach main gehen), Arbeitskopie auf main; alles über `tempRepo()`. */
function setup() {
  const origin = tempRepo("zp-discover-origin-");
  const work = tempRepo("zp-discover-work-");
  repos.push(origin, work);
  write(origin.dir, "data/providers.yaml", CATALOG);
  write(origin.dir, "data/kosten.csv", "kopf\n");
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

const subjects = (r: TempRepo, ref = "HEAD") => r.git("log", "--format=%s", ref).trim().split("\n");

describe("commitNewProvider (Plan 0032, E7 G1/G2/G4)", () => {
  it("committet Katalog und Rohdaten des neuen Anbieters mit dem Text", () => {
    const { work, run } = setup();
    write(work.dir, "data/providers.yaml", WITH_NEW);
    write(work.dir, "data/raw/neu.json", "{}\n");
    let gates = 0;
    commitNewProvider({
      git: run,
      root: work.dir,
      id: "neu",
      message: "data: neuer Anbieter neu (nuernberg)",
      gate: () => gates++,
    });
    expect(gates).toBe(1);
    expect(subjects(work)).toEqual(["data: neuer Anbieter neu (nuernberg)", "start"]);
    expect(work.git("show", "--name-only", "--format=", "HEAD").trim().split("\n").sort()).toEqual([
      "data/providers.yaml",
      "data/raw/neu.json",
    ]);
  });

  it("G2: Änderung an einem bestehenden Eintrag bricht ab, ohne Commit", () => {
    const { work, run } = setup();
    write(work.dir, "data/providers.yaml", WITH_NEW.replace("erste", "geändert"));
    write(work.dir, "data/raw/neu.json", "{}\n");
    expect(() => commitNewProvider({ git: run, root: work.dir, id: "neu", message: "x", gate: () => {} })).toThrow(
      /G2/,
    );
    expect(subjects(work)).toEqual(["start"]);
  });

  it("G2: ein anderer neuer Eintrag als erwartet bricht ab", () => {
    const { work, run } = setup();
    write(work.dir, "data/providers.yaml", WITH_NEW);
    write(work.dir, "data/raw/anders.json", "{}\n");
    expect(() => commitNewProvider({ git: run, root: work.dir, id: "anders", message: "x", gate: () => {} })).toThrow(
      /G2: neue Katalogeinträge neu, erwartet anders/,
    );
  });

  it("G1 rot: Änderungen zurückgenommen, GateError, kein Commit", () => {
    const { work, run } = setup();
    write(work.dir, "data/providers.yaml", WITH_NEW);
    write(work.dir, "data/raw/neu.json", "{}\n");
    const gate = () => {
      throw new Error("check:fast rot\nDetails");
    };
    expect(() => commitNewProvider({ git: run, root: work.dir, id: "neu", message: "x", gate })).toThrow(GateError);
    expect(readFileSync(join(work.dir, "data/providers.yaml"), "utf8")).toBe(CATALOG);
    expect(existsSync(join(work.dir, "data/raw/neu.json"))).toBe(false);
    expect(subjects(work)).toEqual(["start"]);
  });

  it("fremde Änderung im Arbeitsbaum bricht ab", () => {
    const { work, run } = setup();
    write(work.dir, "data/providers.yaml", WITH_NEW);
    write(work.dir, "data/raw/neu.json", "{}\n");
    write(work.dir, "data/offers.json", "{}\n");
    expect(() => commitNewProvider({ git: run, root: work.dir, id: "neu", message: "x", gate: () => {} })).toThrow(
      /data\/offers\.json/,
    );
  });
});

describe("commitRunState", () => {
  it("committet Zustand und Kosten, ohne Änderung nichts", () => {
    const { work, run } = setup();
    expect(commitRunState({ git: run, root: work.dir, message: "x", gate: () => {} })).toBe(false);
    write(work.dir, "data/discover/nuernberg.json", "{}\n");
    write(work.dir, "data/kosten.csv", "kopf\nzeile\n");
    expect(commitRunState({ git: run, root: work.dir, message: "data: Entdecken", gate: () => {} })).toBe(true);
    expect(subjects(work)[0]).toBe("data: Entdecken");
  });

  it("Katalogänderung im Zustands-Commit bricht ab", () => {
    const { work, run } = setup();
    write(work.dir, "data/providers.yaml", WITH_NEW);
    write(work.dir, "data/kosten.csv", "kopf\nzeile\n");
    expect(() => commitRunState({ git: run, root: work.dir, message: "x", gate: () => {} })).toThrow(/außerhalb/);
  });
});

describe("publishDiscover (E7.9)", () => {
  it("holt fremde Commits nach, pusht und liefert die Commits mit den SHAs auf main", () => {
    const { origin, work, run } = setup();
    origin.git("checkout", "-q", "main");
    write(origin.dir, "README", "fremd\n");
    origin.git("add", "README");
    origin.git("commit", "-qm", "fremd");
    origin.git("checkout", "-q", "parken");
    write(work.dir, "data/providers.yaml", WITH_NEW);
    write(work.dir, "data/raw/neu.json", "{}\n");
    commitNewProvider({
      git: run,
      root: work.dir,
      id: "neu",
      message: "data: neuer Anbieter neu (nuernberg)\n\nFund-URL: u",
      gate: () => {},
    });
    let validated = 0;
    const r = publishDiscover({ git: run, validate: () => validated++ });
    expect(r.pushed).toBe(true);
    expect(validated).toBe(1);
    expect(subjects(origin, "main")).toEqual(["data: neuer Anbieter neu (nuernberg)", "fremd", "start"]);
    expect(r.commits).toEqual([
      { sha: origin.git("rev-parse", "main").trim(), message: "data: neuer Anbieter neu (nuernberg)\n\nFund-URL: u" },
    ]);
  });

  it("ohne eigene Commits kein Push", () => {
    const { run } = setup();
    expect(publishDiscover({ git: run, validate: () => {} })).toEqual({ pushed: false, commits: [] });
  });

  it("nur auf main", () => {
    const { work, run } = setup();
    work.git("checkout", "-q", "-b", "anders");
    expect(() => publishDiscover({ git: run, validate: () => {} })).toThrow(/main/);
  });
});
