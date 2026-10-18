/**
 * Aktualität der Fahrplanauszüge (Plan 0009, E13), je Netz mit dem Netz im Text (Plan 0039, E4). Nur Warnungen, nie
 * rot: Ein Fahrplan von gestern ist für die Schätzung „Di vormittags“ fast immer noch richtig, ein roter Build
 * blockierte jeden Daten-Deploy (ADR 0002).
 */
import type { NetworkId } from "../../src/domain/regions.ts";
import { addDays, berlinIsoDate, formatGermanDate } from "../../src/domain/time.ts";

/** So viele Tage vor dem Ende der Gültigkeit kommt die Vorwarnung. */
const LEAD_DAYS = 14;

export function timetableWarnings(
  source: { validTo: string },
  now: Date,
  opts: { fixture: boolean; network: NetworkId },
): string[] {
  if (opts.fixture) return [];
  const today = berlinIsoDate(now);
  const until = formatGermanDate(source.validTo);
  const name = opts.network.toUpperCase();
  const command = `\`pnpm pipeline oepnv --netz ${opts.network}\``;
  if (source.validTo < today) {
    return [`${name}-Fahrplanauszug abgelaufen (gültig bis ${until}) – ${command} ausführen`];
  }
  if (source.validTo < addDays(today, LEAD_DAYS)) {
    return [`${name}-Fahrplanwechsel steht an: Auszug gültig bis ${until} – neuen ${name}-Feed mit ${command} holen`];
  }
  return [];
}
