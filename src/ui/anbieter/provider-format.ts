/** Texte der Anbieterübersicht (Plan 0010, E4, E5, E10); im Lazy-Chunk, nicht im Startbundle. */
import type { ProviderRow } from "../../domain/directory.ts";
import { plural, reachShort } from "../format.ts";
import type { ReachMode } from "../use-transit.ts";

/** „Gostenhof“, „Gostenhof, St. Johannis“, „Gostenhof, St. Johannis +2“ */
export function placesText(places: readonly string[]): string {
  const rest = places.length - 2;
  return places.slice(0, 2).join(", ") + (rest > 0 ? ` +${rest}` : "");
}

const join = (parts: readonly string[]) => parts.filter((p) => p !== "").join(" · ");

/**
 * Zweite Zeile eines aktiven Anbieters: „3 Angebote · Gostenhof · 25 Min.“ bzw. „1 von 3 Angeboten · …“. Die Wegzeit
 * steht nur mit Wert und nicht beim Laden; dann zeigt die Liste ohnehin den Platzhalter-Block (E10).
 */
export function providerLine(row: ProviderRow, mode: ReachMode | undefined): string {
  const count =
    row.shown === row.upcoming
      ? plural(row.upcoming, "Angebot", "Angebote")
      : `${row.shown} von ${plural(row.upcoming, "Angebot", "Angeboten")}`;
  const reach = mode && mode.kind !== "laedt" && row.nearest ? reachShort(row.nearest) : "";
  return join([count, placesText(row.places), reach]);
}

/** Zweite Zeile einer blassen Zeile (E10), die Orte kommen hier aus dem Katalog. */
export function idleLine(row: ProviderRow): string {
  const text =
    row.state === "ohne-termine"
      ? "Gerade keine Termine im Plan"
      : row.upcoming === 1
        ? "1 Angebot, passt nicht zur Auswahl"
        : `${row.upcoming} Angebote, keins passt zur Auswahl`;
  return join([text, placesText(row.places)]);
}

/** Zeile unter den aktiven Anbietern (E4) */
export function hiddenProvidersText(count: number): string {
  return count === 1
    ? "1 weiterer Anbieter hat gerade nichts Passendes."
    : `${count} weitere Anbieter haben gerade nichts Passendes.`;
}

/** Live-Region unter der Suche: „12 Anbieter“ (E5) */
export function providerCountText(count: number): string {
  return plural(count, "Anbieter", "Anbieter");
}
