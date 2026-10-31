/**
 * Tippen und Halten am Herz als reine Zustandsmaschine (Plan 0057, E2). Der Knopf (`HeartButton`) verdrahtet nur
 * Ereignisse und Timer und führt die Effekte aus.
 * - `click` ist der einzige Tipp-Pfad (`cycle`), gleich ob Maus, Touch, Tastatur oder Hilfstechnik.
 * - Zeiger-Ereignisse dienen nur dem Halten: `down` startet bei „aus“ und „vorgemerkt“ den Halte-Timer, Bewegung über
 *   10 px, `up` und `cancel` beenden ihn. Läuft er ab, wird fest eingeplant (`fest`), und das Verschluck-Flag schluckt
 *   genau den `click` nach dem Loslassen.
 * - Das Flag fällt beim nächsten `down` oder 600 ms nach `up` bzw. `cancel`, nie vorher (Review 3, B2).
 */
import type { SavedStage } from "../domain/saved.ts";

/** Haltezeit bis „fest eingeplant“ (freigegebene Demo `docs/design/merkliste/HerzDemo.dc.html`) */
export const HOLD_MS = 550;
/** Weiter bewegt ist kein Halten mehr, sondern Scrollen */
const MOVE_PX = 10;
/** So lange nach dem Loslassen wird ein `click` nach dem Halten geschluckt */
export const SWALLOW_MS = 600;

export interface GestureState {
  /** Startpunkt des laufenden Haltens */
  start: { x: number; y: number } | undefined;
  holding: boolean;
  /** den nächsten `click` schlucken: Das Halten hat schon geschaltet */
  swallow: boolean;
}

export const IDLE_GESTURE: GestureState = { start: undefined, holding: false, swallow: false };

export type GestureEvent =
  | { type: "down"; x: number; y: number; primary: boolean; stage: SavedStage }
  | { type: "move"; x: number; y: number }
  | { type: "up" }
  | { type: "cancel" }
  | { type: "holdElapsed" }
  | { type: "swallowElapsed" }
  | { type: "click" };

/** Timer starten bzw. stoppen, dazu die Wirkungen `cycle` (Tipp) und `fest` (Halten abgelaufen) */
export type GestureEffect = "startHold" | "stopHold" | "startSwallow" | "stopSwallow" | "cycle" | "fest";

type Step = [GestureState, GestureEffect[]];

function endHold(state: GestureState): Step {
  const effects: GestureEffect[] = state.holding ? ["stopHold"] : [];
  if (state.swallow) effects.push("startSwallow");
  return [{ ...state, start: undefined, holding: false }, effects];
}

export function heartGesture(state: GestureState, event: GestureEvent): Step {
  switch (event.type) {
    case "down": {
      if (!event.primary) return [state, []];
      const effects: GestureEffect[] = state.swallow ? ["stopSwallow"] : [];
      // Auf „fest“ gibt es nichts mehr einzuplanen: Der Tipp entfernt
      if (event.stage === "fest") return [IDLE_GESTURE, effects];
      return [{ start: { x: event.x, y: event.y }, holding: true, swallow: false }, [...effects, "startHold"]];
    }
    case "move": {
      if (!state.holding || !state.start) return [state, []];
      const moved = Math.hypot(event.x - state.start.x, event.y - state.start.y) > MOVE_PX;
      return moved ? [{ ...state, start: undefined, holding: false }, ["stopHold"]] : [state, []];
    }
    case "up":
    case "cancel":
      return endHold(state);
    case "holdElapsed":
      if (!state.holding) return [state, []];
      return [{ start: undefined, holding: false, swallow: true }, ["stopHold", "fest"]];
    case "swallowElapsed":
      return [{ ...state, swallow: false }, []];
    case "click":
      if (state.swallow) return [{ ...state, swallow: false }, ["stopSwallow"]];
      return [state, ["cycle"]];
  }
}
