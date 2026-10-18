/**
 * Wann die Wochen-Nachricht geht (Plan 0017, E1): samstags gegen 10 Uhr Berliner Zeit. Der Zeitplan steht in
 * `.github/workflows/push-weekly.yml` (`cron` mit `timezone`); ein Test hält YAML und Konstanten gleich. Ein Zeitfenster
 * gibt es nicht mehr: GitHub startet den Lauf oft Stunden zu spät, und jeder Zeitplan-Lauf soll senden. Einen zweiten
 * Versand am selben Tag verhindert die Versand-Marke im Worker. Rein.
 */
import { berlinIsoDate } from "../../src/domain/time.ts";

/** ISO-Wochentag Samstag */
const PUSH_WEEKDAY = 6;
const PUSH_HOUR = 10;
/** Minute 7 statt 0: Läufe zur vollen Stunde verspätet oder verwirft GitHub unter Last. */
const PUSH_MINUTE = 7;

export const PUSH_CRON = `${PUSH_MINUTE} ${PUSH_HOUR} * * ${PUSH_WEEKDAY % 7}`;
export const PUSH_TIMEZONE = "Europe/Berlin";

/** Berliner Kalendertag, z. B. für die Versand-Marke `POST /versand/<YYYY-MM-DD>` im Worker. */
export function berlinDay(now: Date): string {
  return berlinIsoDate(now);
}
