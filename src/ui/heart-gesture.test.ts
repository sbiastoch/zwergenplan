import { describe, expect, it } from "vitest";
import type { SavedStage } from "../domain/saved.ts";
import {
  type GestureEffect,
  type GestureEvent,
  type GestureState,
  HOLD_MS,
  heartGesture,
  IDLE_GESTURE,
  SWALLOW_MS,
} from "./heart-gesture.ts";

/**
 * Spielt Ereignisse ab wie der Knopf: Timer-Effekte werden als Zeitpunkte gemerkt und feuern, sobald ein Ereignis mit
 * späterem `at` kommt (oder per `wait`). Gezählt werden nur die Wirkungen `cycle` und `fest`.
 */
function run(stage: SavedStage, steps: readonly (GestureEvent | { wait: number })[]) {
  let state: GestureState = IDLE_GESTURE;
  let now = 0;
  const timers = new Map<"hold" | "swallow", number>();
  const actions: ("cycle" | "fest")[] = [];
  const apply = (event: GestureEvent) => {
    const [next, effects] = heartGesture(state, event);
    state = next;
    for (const effect of effects) handle(effect);
  };
  const handle = (effect: GestureEffect) => {
    if (effect === "startHold") timers.set("hold", now + HOLD_MS);
    else if (effect === "stopHold") timers.delete("hold");
    else if (effect === "startSwallow") timers.set("swallow", now + SWALLOW_MS);
    else if (effect === "stopSwallow") timers.delete("swallow");
    else actions.push(effect);
  };
  const advance = (to: number) => {
    for (;;) {
      const due = [...timers].filter(([, at]) => at <= to).sort((a, b) => a[1] - b[1])[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1];
      apply({ type: due[0] === "hold" ? "holdElapsed" : "swallowElapsed" });
    }
    now = to;
  };
  for (const step of steps) {
    if ("wait" in step) {
      advance(now + step.wait);
      continue;
    }
    apply(step.type === "down" ? { ...step, stage } : step);
  }
  return { actions, state };
}

const down = (x = 0, y = 0): GestureEvent => ({ type: "down", x, y, primary: true, stage: "aus" });
const up: GestureEvent = { type: "up" };
const click: GestureEvent = { type: "click" };

describe("heartGesture (Plan 0057, E2)", () => {
  it("kurzer Tipp: genau ein cycle", () => {
    expect(run("aus", [down(), { wait: 100 }, up, click]).actions).toEqual(["cycle"]);
  });

  it("click ohne vorangehendes down (Hilfstechnik, Tastatur) schaltet weiter", () => {
    expect(run("aus", [click]).actions).toEqual(["cycle"]);
    expect(run("vorgemerkt", [click, click]).actions).toEqual(["cycle", "cycle"]);
  });

  it("Halten ≥ 550 ms plant fest ein, das folgende up und click schalten nicht weiter", () => {
    expect(run("aus", [down(), { wait: HOLD_MS }, up, click]).actions).toEqual(["fest"]);
    expect(run("vorgemerkt", [down(), { wait: 700 }, up, click]).actions).toEqual(["fest"]);
  });

  it("Halten 2 s: Das Flag fällt erst 600 ms nach up, der click danach wird geschluckt", () => {
    const { actions } = run("aus", [down(), { wait: 2000 }, up, { wait: 100 }, click]);
    expect(actions).toEqual(["fest"]);
  });

  it("Halten ohne folgenden click (System-Long-Press): Das Flag fällt nach 600 ms, der nächste click wirkt", () => {
    const steps = [down(), { wait: 700 }, up, { wait: SWALLOW_MS }, click];
    expect(run("aus", steps).actions).toEqual(["fest", "cycle"]);
    // ebenso nach pointercancel
    expect(run("aus", [down(), { wait: 700 }, { type: "cancel" }, { wait: SWALLOW_MS }, click]).actions).toEqual([
      "fest",
      "cycle",
    ]);
  });

  it("der nächste Tipp nach dem Halten wirkt: down setzt das Flag zurück", () => {
    const steps = [down(), { wait: 700 }, { type: "cancel" } as const, { wait: 300 }, down(), { wait: 80 }, up, click];
    expect(run("aus", steps).actions).toEqual(["fest", "cycle"]);
  });

  it("Bewegung über 10 px bricht das Halten ab, 10 px nicht", () => {
    expect(run("aus", [down(0, 0), { type: "move", x: 8, y: 7 }, { wait: 700 }]).actions).toEqual([]);
    expect(run("aus", [down(0, 0), { type: "move", x: 6, y: 8 }, { wait: 700 }]).actions).toEqual(["fest"]);
  });

  it("cancel und frühes up beenden nur das Halten", () => {
    expect(run("aus", [down(), { wait: 200 }, { type: "cancel" }, { wait: 700 }]).actions).toEqual([]);
    const early = run("aus", [down(), { wait: 200 }, up, { wait: 700 }]);
    expect(early.actions).toEqual([]);
    expect(early.state.holding).toBe(false);
  });

  it("auf „fest“ startet kein Halten, der Tipp entfernt", () => {
    expect(run("fest", [down(), { wait: 900 }, up, click]).actions).toEqual(["cycle"]);
  });

  it("nur der Hauptknopf hält", () => {
    const right: GestureEvent = { type: "down", x: 0, y: 0, primary: false, stage: "aus" };
    let state = IDLE_GESTURE;
    const [next, effects] = heartGesture(state, right);
    state = next;
    expect(effects).toEqual([]);
    expect(state.holding).toBe(false);
  });
});
