/**
 * Die allgemeine Wochen-Nachricht, die die CI samstags an alle Abos schickt (Plan 0017, E2, E5). Sie nennt nur Zahlen
 * aus den öffentlichen Daten – den Zuschnitt auf Such-Abos und Alter macht der Service Worker auf dem Gerät
 * (`news.ts`, ADR 0014). Den allgemeinen Text sieht man nur, wenn das Gerät nicht zuschneiden kann.
 */
import type { DeclarativePushPayload } from "./push-types.ts";
import { toBerlinIso } from "./time.ts";

/** Tag der Nachricht; ersetzt auf iOS keine ältere, mehrere Pushes stapeln sich (Spike). */
export const PUSH_TAG = "wochen-nachricht";

/**
 * Topic des Push-Dienstes: Ein noch nicht zugestelltes Push wird ersetzt. Muss Base64url sein, mit einer Länge,
 * die ein Vielfaches von 4 ist – Apple lehnt „neue-angebote“ mit 400 `BadWebPushTopic` ab (Spike).
 */
export const PUSH_TOPIC = "neueangebote";

/** Wie lange der Push-Dienst ein Push für ein offline Gerät aufhebt: 1 Tag (am Montag ist die Samstagsnachricht alt). */
export const PUSH_TTL_SECONDS = 86_400;

/** Fester Text, wenn die Payload kaputt ist: Chrome verlangt bei jedem Push eine sichtbare Nachricht (Plan 0011, E10). */
export const FALLBACK_TITLE = "Neues im Zwergenplan";

function count(n: number, what: string): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Keine gültige Anzahl für ${what}: ${n}`);
  return n;
}

function generalBody(news: number, week: number): string {
  if (news > 0) return `${news === 1 ? "1 neues Angebot" : `${news} neue Angebote`} seit letztem Samstag`;
  if (week === 0) return "Diese Woche nichts Neues.";
  return `Diese Woche nichts Neues. ${week === 1 ? "1 Angebot" : `${week} Angebote`} in den nächsten 7 Tagen.`;
}

/**
 * `news`: neue Angebote seit dem Datenstand vor 7 × 24 h; `week`: Angebote mit einem Termin in den nächsten 7 Tagen.
 * `navigate` ist immer die Startseite (Nutzerentscheidung 4). `test` markiert einen Testversand: Der Service Worker
 * schreibt dann nichts in den Geräte-Speicher (E3).
 */
export function weeklyPayload({
  news,
  week,
  siteUrl,
  sentAt,
  test,
}: {
  news: number;
  week: number;
  siteUrl: string;
  sentAt: Date;
  test?: true;
}): DeclarativePushPayload {
  return {
    web_push: 8030,
    notification: {
      title: "Zwergenplan",
      body: generalBody(count(news, "neue Angebote"), count(week, "Angebote der Woche")),
      navigate: new URL("./", siteUrl).href,
      tag: PUSH_TAG,
      lang: "de",
      data: test ? { sentAt: toBerlinIso(sentAt), test } : { sentAt: toBerlinIso(sentAt) },
    },
    mutable: true,
  };
}
