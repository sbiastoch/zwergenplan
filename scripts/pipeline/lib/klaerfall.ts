/**
 * Klärfälle des Entdeckens (Plan 0050, E5), reine Logik auf `DiscoverState.klaerfaelle`: Ein Kandidat, den ein
 * technischer Grund oder eine mögliche Dublette aufhält, wird weder verworfen noch zurückgestellt. Jeder Lauf prüft
 * ihn erneut (Quelle `klaerfall`), bis Aufnahme, Verwerfung oder ein Mensch ihn beendet.
 */
import { addDays } from "../../../src/domain/time.ts";
import type { Find } from "./discover.ts";
import { normalizeUrl } from "./discover.ts";
import type { DiscoverState } from "./discover-state.ts";

/** Ab drei Klärfällen am Kandidaten setzt er einen Monatslauf aus */
export const SUSPEND_DAYS = 35;
const SUSPEND_AFTER = 3;

/**
 * `kandidat`: liegt am Kandidaten (Seite leer, Geocoder ohne Treffer, Dublette, ungültige Antwort). `lauf`: liegt am
 * Lauf (Zeitbudget, Limit, G3, Geocoder-Ausfall); aktualisiert `zuletzt`, zählt aber nicht für `anzahl`.
 */
export type KlaerfallArt = "kandidat" | "lauf";

const sameUrl = (a: string, b: string) => (normalizeUrl(a) ?? a) === (normalizeUrl(b) ?? b);

export function addKlaerfall(
  state: DiscoverState,
  find: Find,
  grund: string,
  art: KlaerfallArt,
  today: string,
): DiscoverState {
  const before = state.klaerfaelle.find((k) => sameUrl(k.url, find.url));
  const anzahl = (before?.anzahl ?? 0) + (art === "kandidat" ? 1 : 0);
  const suspend = art === "kandidat" && anzahl >= SUSPEND_AFTER;
  const { aussetzenBis: _, ...rest } = before ?? {};
  const next = {
    ...rest,
    url: before?.url ?? find.url,
    name: find.name,
    // ein Lauf-Grund überdeckt nicht den Grund am Kandidaten, den der Wächter meldet (Arch-Review S1, m3)
    grund: art === "lauf" && before && before.anzahl > 0 ? before.grund : grund,
    seit: before?.seit ?? today,
    zuletzt: today,
    anzahl,
    ...(suspend
      ? { aussetzenBis: addDays(today, SUSPEND_DAYS) }
      : before?.aussetzenBis
        ? { aussetzenBis: before.aussetzenBis }
        : {}),
  };
  return {
    ...state,
    klaerfaelle: [...state.klaerfaelle.filter((k) => !sameUrl(k.url, find.url)), next],
  };
}

export function endKlaerfall(state: DiscoverState, url: string): DiscoverState {
  return { ...state, klaerfaelle: state.klaerfaelle.filter((k) => !sameUrl(k.url, url)) };
}

/** Offene Klärfälle als Kandidaten (E2, Quelle `klaerfall`); ausgesetzte erst ab `aussetzenBis` */
export function klaerfallFinds(state: DiscoverState, today: string): Find[] {
  return state.klaerfaelle
    .filter((k) => k.aussetzenBis === undefined || k.aussetzenBis <= today)
    .map((k) => ({ name: k.name, url: k.url, warum: `offener Klärfall: ${k.grund}`, quelle: "klaerfall" }));
}
