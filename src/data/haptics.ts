/**
 * Kurze Vibration als Rückmeldung am Herz (Plan 0057, E2): 8 ms beim Vormerken, 25 ms beim Festeinplanen. Nur hier fasst
 * die App `navigator.vibrate` an (Biome `noRestrictedGlobals` für src/ui). iOS kennt die API nicht, dann passiert nichts.
 */

/** Der Teil der Vibration-API, den wir brauchen; im Unit-Test ein Stub */
export interface VibrateApi {
  vibrate?: (pattern: number) => boolean;
}

function browserApi(): VibrateApi | undefined {
  return typeof navigator === "undefined" ? undefined : navigator;
}

export function vibrate(ms: number, api: VibrateApi | undefined = browserApi()): void {
  try {
    api?.vibrate?.(ms);
  } catch {
    // ohne Nutzer-Aktivierung oder per Richtlinie gesperrt: keine Rückmeldung, sonst nichts
  }
}
