/**
 * robots.txt je Origin und Lauf (Plan 0048, E8): einmal abgerufen, dann aus dem Cache geprüft. Den Abruf reicht
 * `io/http.ts` herein (Weiterleitungen der robots.txt verfolgt er selbst); so entsteht kein Importzyklus.
 */
import { type RobotsState, robotsAllows, robotsFromResponse } from "../lib/robots.ts";

type RobotsVerdict =
  | { ok: true }
  /** `gesperrt`: robots.txt verbietet den Pfad; `voruebergehend`: robots.txt nicht erreichbar */
  | { ok: false; reason: string; klasse: "gesperrt" | "voruebergehend" };

type FetchRobotsTxt = (url: string) => Promise<{ status: number; body: string }>;

const reasonOf = (e: unknown) => (e instanceof Error ? e.message.split("\n")[0] : String(e))?.slice(0, 120) ?? "";

export interface RobotsCache {
  check(url: string, fetchRobotsTxt: FetchRobotsTxt): Promise<RobotsVerdict>;
}

export function robotsCache(): RobotsCache {
  const byOrigin = new Map<string, Promise<RobotsState>>();
  const load = async (origin: string, fetchRobotsTxt: FetchRobotsTxt): Promise<RobotsState> => {
    try {
      const res = await fetchRobotsTxt(`${origin}/robots.txt`);
      return robotsFromResponse(res.status, res.body);
    } catch (e) {
      return { kind: "unerreichbar", reason: `robots.txt nicht erreichbar (${reasonOf(e)})` };
    }
  };
  return {
    async check(url, fetchRobotsTxt) {
      const u = new URL(url);
      let state = byOrigin.get(u.origin);
      if (!state) {
        state = load(u.origin, fetchRobotsTxt);
        byOrigin.set(u.origin, state);
      }
      const s = await state;
      if (s.kind === "alles") return { ok: true };
      if (s.kind === "unerreichbar") return { ok: false, reason: s.reason, klasse: "voruebergehend" };
      const path = `${u.pathname}${u.search}`;
      return robotsAllows(s.rules, path)
        ? { ok: true }
        : { ok: false, reason: `robots.txt sperrt ${path}`, klasse: "gesperrt" };
    },
  };
}
