/**
 * Standort des Geräts (Plan 0004, E3). Nur auf Tipp, nie automatisch. Die Rohkoordinate verlässt
 * diese Datei nie: Sie wird sofort auf ca. 100 m gerundet (`coarsen`) und gegen `NUERNBERG_BBOX`
 * geprüft. Die Rohkoordinate wird nie gespeichert, geloggt oder verschickt; den gerundeten Punkt behält
 * höchstens `preferences.ts` auf dem Gerät (ADR 0017, docs/architecture.md).
 */
import { coarsen, type GeoPoint, inBounds } from "../domain/geo.ts";

export type PositionProblem = "denied" | "unavailable" | "timeout" | "outside" | "unsupported";
export type PositionResult = { ok: true; point: GeoPoint } | { ok: false; reason: PositionProblem };

/**
 * Der Teil der Geolocation-API, den wir brauchen. `navigator.geolocation` passt hinein; im Unit-Test
 * steht hier ein Stub, damit er ohne Browser läuft.
 */
export interface PositionApi {
  getCurrentPosition(
    success: (position: { coords: { latitude: number; longitude: number } }) => void,
    error: (error: { code: number }) => void,
    options: PositionOptions,
  ): void;
}

export interface LocationEnv {
  geolocation: PositionApi | undefined;
  isSecureContext: boolean;
}

/** grob reicht, nach 10 s aufgeben, eine bis zu 5 min alte Position ist gut genug */
const OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 };

/** GeolocationPositionError.code: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT */
function reasonFor(code: number): PositionProblem {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

function browserEnv(): LocationEnv {
  return {
    geolocation: typeof navigator === "undefined" ? undefined : navigator.geolocation,
    isSecureContext: globalThis.isSecureContext === true,
  };
}

/** Ob der Knopf „Meinen Standort nutzen“ überhaupt erscheint. */
export function canLocate(env: LocationEnv = browserEnv()): boolean {
  return env.isSecureContext && env.geolocation !== undefined;
}

/**
 * Eigenes Gesamt-Zeitlimit. `OPTIONS.timeout` zählt erst ab der Freigabe: Bleibt der Berechtigungsdialog offen
 * oder antwortet das Gerät nie, hinge „Suche Standort …“ sonst für immer (Arch-Review 0004, m2).
 */
const OVERALL_TIMEOUT_MS = 15_000;

/** Fragt den Standort einmal ab. Liefert nur den gerundeten Punkt oder einen Fehlergrund. */
export function requestPosition(env: LocationEnv = browserEnv()): Promise<PositionResult> {
  const { geolocation } = env;
  if (!geolocation || !env.isSecureContext) return Promise.resolve({ ok: false, reason: "unsupported" });
  return new Promise((resolve) => {
    // Was zuerst kommt, gilt; eine spätere Antwort ändert ein erfülltes Promise nicht mehr.
    const timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), OVERALL_TIMEOUT_MS);
    const settle = (result: PositionResult) => {
      clearTimeout(timer);
      resolve(result);
    };
    geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = coarsen({ lat: coords.latitude, lon: coords.longitude });
        settle(inBounds(point) ? { ok: true, point } : { ok: false, reason: "outside" });
      },
      ({ code }) => settle({ ok: false, reason: reasonFor(code) }),
      OPTIONS,
    );
  });
}
