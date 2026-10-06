/**
 * Wann die Wochen-Nachricht geht (Plan 0017, E1): samstags gegen 10 Uhr Berliner Zeit. Der Zeitplan steht in
 * `.github/workflows/push-weekly.yml` (`cron` mit `timezone`); ein Test hält YAML und Konstanten gleich. Der Wächter
 * `shouldSendNow` verhindert, dass ein verspäteter oder wiederholter Lauf außerhalb des Fensters sendet. Rein.
 */
import { berlinIsoDate, isoWeekday, toBerlinIso } from "../../src/domain/time.ts";

/** ISO-Wochentag Samstag */
const PUSH_WEEKDAY = 6;
const PUSH_HOUR = 10;
/** Minute 7 statt 0: Läufe zur vollen Stunde verspätet oder verwirft GitHub unter Last. */
const PUSH_MINUTE = 7;
/** Bis wann ein verspäteter Lauf noch sendet (Berliner Stunde, exklusiv). */
const LAST_HOUR = 14;

export const PUSH_CRON = `${PUSH_MINUTE} ${PUSH_HOUR} * * ${PUSH_WEEKDAY % 7}`;
export const PUSH_TIMEZONE = "Europe/Berlin";

/** Berliner Kalendertag, z. B. für die Versand-Marke `POST /versand/<YYYY-MM-DD>` im Worker. */
export function berlinDay(now: Date): string {
  return berlinIsoDate(now);
}

/** Samstag in Berlin zwischen 10:00 und 14:00? */
export function shouldSendNow(now: Date): boolean {
  if (isoWeekday(berlinDay(now)) !== PUSH_WEEKDAY) return false;
  const hour = Number(toBerlinIso(now).slice(11, 13));
  return hour >= PUSH_HOUR && hour < LAST_HOUR;
}
