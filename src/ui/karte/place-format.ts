/** Texte der Orts-Liste (Plan 0005, E7); im Karten-Oberflächen-Chunk, nicht im Startbundle. */
import type { Reach } from "../../domain/reach.ts";
import { distanceShort, plural } from "../format.ts";

/** Zeile der Orts-Liste: „Gostenhof · 3 Angebote · 1,4 km“ (ohne Stadtteil die Adresse). */
export function placeLine(
  place: { district?: string; address: string; offers: readonly unknown[] },
  reach: Reach | undefined,
): string {
  const parts = [place.district ?? place.address, plural(place.offers.length, "Angebot", "Angebote")];
  if (reach) parts.push(distanceShort(reach));
  return parts.join(" · ");
}
