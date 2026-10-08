import { describe, expect, it } from "vitest";
import { decideGates, type GatesInput } from "./ci-gates.ts";

/** Entscheidung des CI-Jobs gates als Tabelle (Plan 0029, B5, Review 2, M2). */
const MAIN = "refs/heads/main";
const BRANCH = "refs/heads/plan-x";

const green = { scope: "success", check: "success", e2e: "success", smoke: "success" };
const base: GatesInput = { ref: MAIN, full: "true", e2e: "full", devices: "true", smoke: "true", results: green };
const input = (
  over: Partial<Omit<GatesInput, "results">>,
  results: Partial<GatesInput["results"]> = {},
): GatesInput => ({
  ...base,
  ...over,
  results: { ...green, ...results },
});

describe("decideGates (B5)", () => {
  it.each<[string, GatesInput, boolean]>([
    ["main, voll, alles grün", input({}), true],
    // Kanarienvogel: Auf main darf nie eine Auswahl gelten (ADR 0023, Nr. 7)
    ["main, e2e=select → rot", input({ e2e: "select" }), false],
    ["main, e2e=none → rot", input({ e2e: "none", devices: "false" }, { e2e: "skipped" }), false],
    ["main, E2E übersprungen → rot", input({}, { e2e: "skipped" }), false],
    ["main, E2E rot → rot", input({}, { e2e: "failure" }), false],
    ["main, Smoke rot → rot", input({}, { smoke: "failure" }), false],
    ["scope rot → rot", input({}, { scope: "failure" }), false],
    ["check rot → rot", input({}, { check: "failure" }), false],
    ["Branch, Auswahl mit Geräten, alles grün", input({ ref: BRANCH, e2e: "select" }), true],
    [
      "Branch, Auswahl mit Geräten, E2E übersprungen → rot",
      input({ ref: BRANCH, e2e: "select" }, { e2e: "skipped" }),
      false,
    ],
    ["Branch, volle Suite, E2E übersprungen → rot", input({ ref: BRANCH, e2e: "full" }, { e2e: "skipped" }), false],
    [
      "Branch, keine Geräte-Specs, E2E übersprungen",
      input({ ref: BRANCH, e2e: "select", devices: "false" }, { e2e: "skipped" }),
      true,
    ],
    [
      "Branch, keine Spec, E2E übersprungen",
      input({ ref: BRANCH, e2e: "none", devices: "false", smoke: "false" }, { e2e: "skipped" }),
      true,
    ],
    [
      "Branch, Smoke-Job rot → rot",
      input({ ref: BRANCH, e2e: "none", devices: "false" }, { e2e: "skipped", smoke: "failure" }),
      false,
    ],
    ["Branch, E2E rot → rot", input({ ref: BRANCH, e2e: "select" }, { e2e: "failure" }), false],
    // Doku-Pfad wie bisher (Plan 0027, E10)
    ["Doku-Pfad, E2E und Smoke übersprungen", input({ full: "false" }, { e2e: "skipped", smoke: "skipped" }), true],
    ["Doku-Pfad, aber E2E gelaufen → rot", input({ full: "false" }, { smoke: "skipped" }), false],
    [
      "Doku-Pfad, check rot → rot",
      input({ full: "false" }, { e2e: "skipped", smoke: "skipped", check: "failure" }),
      false,
    ],
  ])("%s", (_name, gates, ok) => {
    const r = decideGates(gates);
    expect(r.ok).toBe(ok);
    expect(r.message).not.toBe("");
  });

  it("unbekannter Wert von full zählt als voll", () => {
    expect(decideGates(input({ full: "" }, { e2e: "skipped" })).ok).toBe(false);
  });
});
