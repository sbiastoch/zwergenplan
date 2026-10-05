/**
 * Aktualität des Fahrplanauszugs (Plan 0009, E13). Nur Warnungen, nie rot: Ein Fahrplan von gestern ist für
 * die Schätzung „Di vormittags“ fast immer noch richtig, ein roter Build blockierte jeden Daten-Deploy (ADR 0002).
 */
import { addDays, berlinIsoDate, formatGermanDate } from "../../src/domain/time.ts";

/** So viele Tage vor dem Ende der Gültigkeit kommt die Vorwarnung. */
const LEAD_DAYS = 14;

export function timetableWarnings(source: { validTo: string }, now: Date, opts: { fixture: boolean }): string[] {
  if (opts.fixture) return [];
  const today = berlinIsoDate(now);
  const until = formatGermanDate(source.validTo);
  if (source.validTo < today) {
    return [`Fahrplanauszug abgelaufen (gültig bis ${until}) – \`pnpm pipeline oepnv\` ausführen`];
  }
  if (source.validTo < addDays(today, LEAD_DAYS)) {
    return [`Fahrplanwechsel steht an: Auszug gültig bis ${until} – neuen VGN-Feed mit \`pnpm pipeline oepnv\` holen`];
  }
  return [];
}
